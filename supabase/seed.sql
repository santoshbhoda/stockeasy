-- ============================================================================
-- StockEasy Seed Data (Supabase / PostgreSQL)
-- Initial branches and product categories for Hyderabad electronics retail
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SEED BRANCHES
-- ----------------------------------------------------------------------------
insert into public.branches (name, address, phone)
select
  'Main Branch - Ameerpet',
  'Shop #4-5, Ground Floor, Ameerpet Commercial Complex, Beside Metro Station, Ameerpet, Hyderabad, Telangana 500016',
  '+91 98490 12345'
where not exists (
  select 1 from public.branches where name = 'Main Branch - Ameerpet'
);

insert into public.branches (name, address, phone)
select
  'Branch 2 - Kukatpally',
  'Plot #12, Phase 1, Near KPHB Metro Station, Dharma Reddy Colony, Kukatpally, Hyderabad, Telangana 500072',
  '+91 98490 67890'
where not exists (
  select 1 from public.branches where name = 'Branch 2 - Kukatpally'
);

-- ----------------------------------------------------------------------------
-- 2. SEED CATEGORIES (12 Electronics & Electrical Categories)
-- ----------------------------------------------------------------------------
insert into public.categories (name, icon)
values
  ('Television', '📺'),
  ('Refrigerator', '🧊'),
  ('Washing Machine', '🫧'),
  ('Air Conditioner', '❄️'),
  ('Microwave Oven', '🍳'),
  ('Ceiling Fan', '🌀'),
  ('Water Heater', '🔥'),
  ('Mixer Grinder', '⚡'),
  ('Iron Box', '👔'),
  ('Stabilizer', '🔌'),
  ('Inverter & Battery', '🔋'),
  ('LED Lights', '💡')
on conflict (name) do update set
  icon = excluded.icon;
