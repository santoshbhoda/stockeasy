-- ============================================================================
-- StockEasy Database Schema (Supabase / PostgreSQL)
-- Inventory Management PWA for Electronics Retail Store in Hyderabad, India
-- ============================================================================

-- Enable required extensions
create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. TABLES DEFINITION
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Branches Table
-- ----------------------------------------------------------------------------
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Profiles Table (Extends Supabase auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  branch_id uuid references public.branches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Categories Table
-- ----------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text, -- emoji icon representation (e.g. 📺, 🧊)
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Products Table
-- ----------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  barcode text not null unique,
  name text not null,
  brand text not null,
  model text,
  category_id uuid references public.categories(id) on delete set null,
  mrp numeric(10, 2),
  purchase_price numeric(10, 2),
  reorder_level integer not null default 5 check (reorder_level >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Inventory Table (Branch-level stock per product)
-- ----------------------------------------------------------------------------
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  unique (product_id, branch_id)
);

-- ----------------------------------------------------------------------------
-- Stock Movements Table (Audit trail for stock in/out/transfers)
-- ----------------------------------------------------------------------------
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('IN', 'OUT', 'TRANSFER_IN', 'TRANSFER_OUT')),
  quantity integer not null check (quantity > 0),
  reason text check (reason in ('purchase', 'sale', 'damaged', 'returned', 'transfer')),
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

-- Product barcode index for high-speed scanner lookups
create index if not exists idx_products_barcode on public.products(barcode);

-- Product category index for filtering
create index if not exists idx_products_category_id on public.products(category_id);

-- Inventory composite index for product & branch lookups
create index if not exists idx_inventory_product_branch on public.inventory(product_id, branch_id);

-- Stock movements index by creation date (descending for recent transactions)
create index if not exists idx_stock_movements_created_at on public.stock_movements(created_at desc);

-- Stock movements index by product
create index if not exists idx_stock_movements_product_id on public.stock_movements(product_id);

-- Stock movements index by branch
create index if not exists idx_stock_movements_branch_id on public.stock_movements(branch_id);

-- Profiles index by branch
create index if not exists idx_profiles_branch_id on public.profiles(branch_id);

-- ============================================================================
-- 3. FUNCTIONS & TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Trigger Function: Auto-update updated_at timestamp
-- ----------------------------------------------------------------------------
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply updated_at trigger to tables
drop trigger if exists set_branches_updated_at on public.branches;
create trigger set_branches_updated_at
  before update on public.branches
  for each row execute function public.handle_updated_at();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
  before update on public.products
  for each row execute function public.handle_updated_at();

drop trigger if exists set_inventory_updated_at on public.inventory;
create trigger set_inventory_updated_at
  before update on public.inventory
  for each row execute function public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- Trigger Function: Auto-create profile on auth.users sign up
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role, branch_id)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1),
      'User'
    ),
    coalesce(new.raw_user_meta_data->>'phone', new.phone, null),
    coalesce(new.raw_user_meta_data->>'role', 'staff'),
    case
      when (new.raw_user_meta_data->>'branch_id') is not null and (new.raw_user_meta_data->>'branch_id') <> ''
      then (new.raw_user_meta_data->>'branch_id')::uuid
      else null
    end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- 4. RLS SECURITY DEFINER HELPER FUNCTIONS
-- ============================================================================

-- Check if current authenticated user is an owner
create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner'
  );
$$;

-- Get current authenticated user's assigned branch_id
create or replace function public.get_user_branch_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select branch_id from public.profiles
  where id = auth.uid();
$$;

-- Get current authenticated user's role
create or replace function public.get_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles
  where id = auth.uid();
$$;

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.branches enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.inventory enable row level security;
alter table public.stock_movements enable row level security;

-- ----------------------------------------------------------------------------
-- Profiles Policies
-- ----------------------------------------------------------------------------
-- Users can read their own profile; Owner can read all profiles
create policy "Profiles viewable by self or owner"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id or public.is_owner());

-- Profile creation via trigger or by self/owner
create policy "Profiles insertable by self or owner"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id or public.is_owner());

-- Users can update own profile (or owner can update any profile)
create policy "Profiles updatable by self or owner"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id or public.is_owner())
  with check (auth.uid() = id or public.is_owner());

-- Only owners can delete profile records
create policy "Profiles deletable by owner"
  on public.profiles for delete
  to authenticated
  using (public.is_owner());

-- ----------------------------------------------------------------------------
-- Branches Policies
-- ----------------------------------------------------------------------------
-- All authenticated users (owner & staff) can read branches
create policy "Branches viewable by authenticated users"
  on public.branches for select
  to authenticated
  using (true);

-- Only owners can insert branches
create policy "Branches insertable by owner"
  on public.branches for insert
  to authenticated
  with check (public.is_owner());

-- Only owners can update branches
create policy "Branches updatable by owner"
  on public.branches for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- Only owners can delete branches
create policy "Branches deletable by owner"
  on public.branches for delete
  to authenticated
  using (public.is_owner());

-- ----------------------------------------------------------------------------
-- Categories Policies
-- ----------------------------------------------------------------------------
-- All authenticated users can read categories
create policy "Categories viewable by authenticated users"
  on public.categories for select
  to authenticated
  using (true);

-- Only owners can insert categories
create policy "Categories insertable by owner"
  on public.categories for insert
  to authenticated
  with check (public.is_owner());

-- Only owners can update categories
create policy "Categories updatable by owner"
  on public.categories for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- Only owners can delete categories
create policy "Categories deletable by owner"
  on public.categories for delete
  to authenticated
  using (public.is_owner());

-- ----------------------------------------------------------------------------
-- Products Policies
-- ----------------------------------------------------------------------------
-- All authenticated users can view products
create policy "Products viewable by authenticated users"
  on public.products for select
  to authenticated
  using (true);

-- Only owners can insert products
create policy "Products insertable by owner"
  on public.products for insert
  to authenticated
  with check (public.is_owner());

-- Only owners can update products
create policy "Products updatable by owner"
  on public.products for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- Only owners can delete products
create policy "Products deletable by owner"
  on public.products for delete
  to authenticated
  using (public.is_owner());

-- ----------------------------------------------------------------------------
-- Inventory Policies
-- ----------------------------------------------------------------------------
-- Owner can view all; Staff can only view inventory of their assigned branch
create policy "Inventory viewable by owner or assigned branch staff"
  on public.inventory for select
  to authenticated
  using (public.is_owner() or branch_id = public.get_user_branch_id());

-- Owner can insert all; Staff can insert only for their assigned branch
create policy "Inventory insertable by owner or assigned branch staff"
  on public.inventory for insert
  to authenticated
  with check (public.is_owner() or branch_id = public.get_user_branch_id());

-- Owner can update all; Staff can update only for their assigned branch
create policy "Inventory updatable by owner or assigned branch staff"
  on public.inventory for update
  to authenticated
  using (public.is_owner() or branch_id = public.get_user_branch_id())
  with check (public.is_owner() or branch_id = public.get_user_branch_id());

-- Only owners can delete inventory records
create policy "Inventory deletable by owner"
  on public.inventory for delete
  to authenticated
  using (public.is_owner());

-- ----------------------------------------------------------------------------
-- Stock Movements Policies
-- ----------------------------------------------------------------------------
-- Owner can view all movements; Staff can view movements for their assigned branch
create policy "Stock movements viewable by owner or assigned branch staff"
  on public.stock_movements for select
  to authenticated
  using (public.is_owner() or branch_id = public.get_user_branch_id());

-- Owner can record all movements; Staff can record for their assigned branch
create policy "Stock movements insertable by owner or assigned branch staff"
  on public.stock_movements for insert
  to authenticated
  with check (public.is_owner() or branch_id = public.get_user_branch_id());

-- Owner can update movements; Staff can update only for their assigned branch
create policy "Stock movements updatable by owner or assigned branch staff"
  on public.stock_movements for update
  to authenticated
  using (public.is_owner() or branch_id = public.get_user_branch_id())
  with check (public.is_owner() or branch_id = public.get_user_branch_id());

-- Only owners can delete stock movements
create policy "Stock movements deletable by owner"
  on public.stock_movements for delete
  to authenticated
  using (public.is_owner());
