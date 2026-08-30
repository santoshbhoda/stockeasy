# 📱 StockEasy — Smart Retail Inventory Management PWA

An open-source, mobile-first Progressive Web Application (PWA) designed specifically for electronic & electrical appliances retail stores with multiple branches.

---

## 🌟 Key Highlights

- **⚡ Zero Infrastructure Cost (₹0/month)**: Hosted on **Render** (Static Site free tier) + **Supabase** (PostgreSQL + Auth + Storage free tier).
- **📷 Instant Barcode & QR Scanning**: Uses the native **Barcode Detection API** on Android Chrome with fallback support for hardware camera feed, flash toggle, and vibration feedback.
- **📴 Offline-First**: Powered by **Dexie.js (IndexedDB)** and a background sync engine (Outbox pattern). Keep scanning and managing inventory even when store internet drops; all mutations sync automatically when back online.
- **🇮🇳 Bilingual Support**: Full support for **Telugu (తెలుగు)** and **English (EN)** tailored for retail counter staff.
- **🏢 Multi-Branch Ready**: Track stock across branches (e.g., Ameerpet & Kukatpally) with live branch switching and stock visibility.
- **👥 Role-Based Access**: Streamlined for **Owner** (all branches, reports, settings, catalog) and **Staff** (scan stock in/out for their branch).

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 📱 Mobile Browser / PWA                     │
│  React 18 + Tailwind CSS + DaisyUI + Barcode Detection API  │
└──────────────────────────────┬──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
  ┌─────────────────────────┐     ┌─────────────────────────┐
  │  💾 Local IndexedDB     │     │   ☁️ Supabase Cloud     │
  │  (Dexie.js Store)       │     │   (PostgreSQL + Auth)   │
  │  • Offline transactions │◄───►│   • Multi-branch sync   │
  │  • Sync Queue (Outbox)  │     │   • Row Level Security  │
  └─────────────────────────┘     └─────────────────────────┘
```

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- **Node.js**: v18 or later
- **npm**: v9 or later

### 2. Clone & Install
```bash
git clone <your-repo-url>
cd Inventory
npm install
```

### 3. Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Update with your Supabase credentials:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Run Development Server
```bash
npm run dev
```
Open `http://localhost:5173` on your browser or mobile network.

---

## 🗄️ Database Setup (Supabase)

1. Create a free account at [supabase.com](https://supabase.com) and create a new project.
2. Go to **SQL Editor** in your Supabase project dashboard.
3. Run the schema creation script from [`supabase/schema.sql`](supabase/schema.sql).
4. Run the seed data script from [`supabase/seed.sql`](supabase/seed.sql) to populate standard appliances categories and branches.
5. In **Authentication > Providers > Email**, ensure email auth is enabled (passwords are used with phone-formatted emails e.g. `9876543210@stockeasy.local`).

---

## 🌐 Free Deployment to Render

1. Push your repository to GitHub.
2. Go to [render.com](https://render.com) and create a **New Static Site**.
3. Connect your repository.
4. Set the following settings:
   - **Build Command**: `npm run build`
   - **Publish Directory**: `dist`
5. In **Environment Variables**, add:
   - `VITE_SUPABASE_URL`: Your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase Public Anon Key
6. Click **Create Static Site**. Render will build and deploy your app with global CDN and SSL enabled for free.

---

## 📱 How to Install on Android Mobile Phone

1. Open the deployed website URL in **Google Chrome** on your Android phone.
2. Tap the browser menu (`⋮` three dots in the top right corner).
3. Tap **"Add to Home screen"** or **"Install app"**.
4. The **StockEasy** icon will appear on your phone screen and open in full-screen standalone mode like a native app.

---

## 📂 Project Structure

```
├── public/
│   ├── favicon.svg
│   └── icons/                 # PWA App Icons (192px, 512px)
├── src/
│   ├── components/            # Reusable UI & Scanner components
│   │   ├── BarcodeScanner.jsx # Core camera barcode/QR scanner
│   │   ├── BottomNav.jsx      # Mobile navigation bar
│   │   ├── LanguageToggle.jsx # Telugu / English switcher
│   │   ├── ProductCard.jsx    # Stock product preview card
│   │   ├── QuantityInput.jsx  # Touch-friendly +/- quantity controls
│   │   ├── StockBadge.jsx     # Color-coded stock indicator
│   │   └── SyncStatusBar.jsx  # Offline & pending sync indicator
│   ├── hooks/                 # Custom React hooks (useAuth, useOnlineStatus)
│   ├── i18n/                  # Bilingual localization (en.json, te.json)
│   ├── lib/                   # Supabase client, Dexie DB, Sync Engine
│   └── pages/                 # Main workflow pages
│       ├── DashboardPage.jsx  # Action tiles & quick stats
│       ├── LoginPage.jsx      # Phone login
│       ├── ProductFormPage.jsx# New product registration
│       ├── ReportsPage.jsx    # Stock analytics & charts
│       ├── SearchPage.jsx     # Search & scan lookup
│       ├── SettingsPage.jsx   # Store & category administration
│       ├── StockInPage.jsx    # Batch/single stock intake
│       └── StockOutPage.jsx   # Sales & damage deduction
└── supabase/
    ├── schema.sql             # DB Schema + RLS Policies + Triggers
    └── seed.sql               # Default categories & branches
```

---

## 📄 License
MIT — Open Source.
