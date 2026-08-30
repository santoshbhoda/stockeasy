import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../lib/db';
import { useAuthContext } from '../App';
import LanguageToggle from '../components/LanguageToggle';

/**
 * DashboardPage Component
 * Main home screen with 4 primary action tiles and quick inventory stats
 */
export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  let auth = {};
  try {
    auth = useAuthContext();
  } catch {
    // Auth context fallback
  }

  const { profile } = auth;
  const currentLang = i18n.language?.startsWith('te') ? 'te' : 'en';

  // Branch name calculation
  const branchName = profile?.branch_name || (profile?.branch_id ? `Branch ${profile.branch_id}` : 'Koti Main Store, Hyderabad');

  // Real-time live statistics from local Dexie database
  const stats = useLiveQuery(
    async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayStartIso = todayStart.toISOString();

      try {
        const [totalProducts, inventoryItems, todayMovements, pendingSync] = await Promise.all([
          db.products ? db.products.filter((p) => p.is_active !== false).count() : 0,
          db.inventory ? db.inventory.toArray() : [],
          db.stockMovements ? db.stockMovements.filter((m) => m.created_at >= todayStartIso).count() : 0,
          db.syncQueue ? db.syncQueue.count() : 0,
        ]);

        const lowStockCount = inventoryItems.filter((inv) => {
          const threshold = Number(inv.min_stock_level) || 5;
          return (Number(inv.quantity) || 0) <= threshold;
        }).length;

        return {
          totalProducts: totalProducts || 0,
          lowStockCount: lowStockCount || 0,
          todayMovements: todayMovements || 0,
          pendingSync: pendingSync || 0,
        };
      } catch (err) {
        console.error('Error querying live stats in dashboard:', err);
        return { totalProducts: 0, lowStockCount: 0, todayMovements: 0, pendingSync: 0 };
      }
    },
    [],
    { totalProducts: 0, lowStockCount: 0, todayMovements: 0, pendingSync: 0 }
  );

  return (
    <div className="space-y-6 pb-6 animate-fadeIn">
      {/* Top Header Card */}
      <header className="bg-base-100 rounded-3xl p-4 sm:p-5 shadow-sm border border-base-300/80">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xl">🏪</span>
              <h1 className="text-xl sm:text-2xl font-black text-primary tracking-tight truncate">
                {t('common.appName', 'StockEasy')}
              </h1>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-base-content/70 font-medium">
              <span className="inline-block w-2 h-2 rounded-full bg-success"></span>
              <span className="truncate">{branchName}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <LanguageToggle compact />
          </div>
        </div>

        {/* Sync Indicator Pill */}
        {stats.pendingSync > 0 ? (
          <div className="mt-3 pt-3 border-t border-base-200 flex items-center justify-between text-xs text-warning-content bg-warning/15 px-3 py-1.5 rounded-xl font-medium">
            <span className="flex items-center gap-1.5">
              <span className="loading loading-spinner loading-xs text-warning"></span>
              {stats.pendingSync} {t('dashboard.pendingSync', 'changes pending sync')}
            </span>
            <span className="badge badge-warning badge-sm font-bold">{stats.pendingSync}</span>
          </div>
        ) : (
          <div className="mt-3 pt-2.5 border-t border-base-200/60 flex items-center justify-between text-xs text-base-content/60 px-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              {t('sync.synced', 'All changes synced locally & cloud')}
            </span>
            <span className="text-[11px] font-mono opacity-80">Offline-ready</span>
          </div>
        )}
      </header>

      {/* 4 Action Tiles Grid (2x2) */}
      <section aria-label="Main Action Grid">
        <h2 className="text-sm font-bold text-base-content/70 uppercase tracking-wider mb-3 px-1">
          {t('dashboard.quickActions', 'Quick Actions')}
        </h2>
        <div className="grid grid-cols-2 gap-3.5 sm:gap-4">
          {/* 1. Stock In Tile */}
          <Link
            to="/stock-in"
            className="group relative flex flex-col justify-between p-4 sm:p-5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white min-h-36 shadow-lg shadow-emerald-500/25 active:scale-95 transition-all overflow-hidden"
          >
            <div className="absolute -right-3 -bottom-3 text-7xl opacity-15 select-none pointer-events-none group-hover:scale-110 transition-transform">
              📦
            </div>
            <div className="text-4xl mb-2">📦</div>
            <div>
              <div className="text-lg sm:text-xl font-extrabold leading-tight">
                {t('dashboard.stockIn', 'Stock In')}
              </div>
              <div className="text-xs text-emerald-100 font-medium mt-0.5 opacity-90">
                {currentLang === 'en' ? 'స్టాక్ ఇన్ (Add)' : 'Add Inventory'}
              </div>
            </div>
          </Link>

          {/* 2. Stock Out Tile */}
          <Link
            to="/stock-out"
            className="group relative flex flex-col justify-between p-4 sm:p-5 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white min-h-36 shadow-lg shadow-orange-500/25 active:scale-95 transition-all overflow-hidden"
          >
            <div className="absolute -right-3 -bottom-3 text-7xl opacity-15 select-none pointer-events-none group-hover:scale-110 transition-transform">
              🛒
            </div>
            <div className="text-4xl mb-2">🛒</div>
            <div>
              <div className="text-lg sm:text-xl font-extrabold leading-tight">
                {t('dashboard.stockOut', 'Stock Out')}
              </div>
              <div className="text-xs text-orange-100 font-medium mt-0.5 opacity-90">
                {currentLang === 'en' ? 'స్టాక్ అవుట్ (Sale)' : 'Deduct Inventory'}
              </div>
            </div>
          </Link>

          {/* 3. Search Tile */}
          <Link
            to="/search"
            className="group relative flex flex-col justify-between p-4 sm:p-5 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white min-h-36 shadow-lg shadow-blue-500/25 active:scale-95 transition-all overflow-hidden"
          >
            <div className="absolute -right-3 -bottom-3 text-7xl opacity-15 select-none pointer-events-none group-hover:scale-110 transition-transform">
              🔍
            </div>
            <div className="text-4xl mb-2">🔍</div>
            <div>
              <div className="text-lg sm:text-xl font-extrabold leading-tight">
                {t('dashboard.search', 'Search')}
              </div>
              <div className="text-xs text-blue-100 font-medium mt-0.5 opacity-90">
                {currentLang === 'en' ? 'వెతకండి (Lookup)' : 'Find Products'}
              </div>
            </div>
          </Link>

          {/* 4. Reports Tile */}
          <Link
            to="/reports"
            className="group relative flex flex-col justify-between p-4 sm:p-5 rounded-2xl bg-purple-500 hover:bg-purple-600 text-white min-h-36 shadow-lg shadow-purple-500/25 active:scale-95 transition-all overflow-hidden"
          >
            <div className="absolute -right-3 -bottom-3 text-7xl opacity-15 select-none pointer-events-none group-hover:scale-110 transition-transform">
              📊
            </div>
            <div className="text-4xl mb-2">📊</div>
            <div>
              <div className="text-lg sm:text-xl font-extrabold leading-tight">
                {t('dashboard.reports', 'Reports')}
              </div>
              <div className="text-xs text-purple-100 font-medium mt-0.5 opacity-90">
                {currentLang === 'en' ? 'రిపోర్ట్స్ (Stats)' : 'Analytics & Logs'}
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* Quick Stats Section */}
      <section aria-label="Inventory Quick Stats" className="space-y-3">
        <h2 className="text-sm font-bold text-base-content/70 uppercase tracking-wider px-1">
          {t('dashboard.quickStats', 'Quick Overview')}
        </h2>

        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          {/* Total Products Stat */}
          <div className="bg-base-100 rounded-2xl p-3 sm:p-4 text-center shadow-sm border border-base-200 flex flex-col justify-between min-h-[96px]">
            <span className="text-xs font-semibold text-base-content/70 leading-tight">
              {t('dashboard.totalProducts', 'Total Products')}
            </span>
            <span className="text-2xl sm:text-3xl font-black text-primary my-1">
              {stats.totalProducts}
            </span>
            <span className="text-[10px] text-base-content/50 font-medium">
              Active SKUs
            </span>
          </div>

          {/* Low Stock Alert Stat */}
          <Link
            to="/reports"
            className={`rounded-2xl p-3 sm:p-4 text-center shadow-sm border flex flex-col justify-between min-h-[96px] transition-transform active:scale-95 ${
              stats.lowStockCount > 0
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200'
                : 'bg-base-100 border-base-200'
            }`}
          >
            <span className="text-xs font-semibold leading-tight flex items-center justify-center gap-1">
              {stats.lowStockCount > 0 && <span>⚠️</span>}
              {t('dashboard.lowStockAlert', 'Low Stock')}
            </span>
            <span
              className={`text-2xl sm:text-3xl font-black my-1 ${
                stats.lowStockCount > 0 ? 'text-amber-600 dark:text-amber-400 font-extrabold' : 'text-base-content'
              }`}
            >
              {stats.lowStockCount}
            </span>
            <span className="text-[10px] opacity-70 font-medium">
              {stats.lowStockCount > 0 ? 'Need Reorder' : 'All Stock OK'}
            </span>
          </Link>

          {/* Today's Movements Stat */}
          <div className="bg-base-100 rounded-2xl p-3 sm:p-4 text-center shadow-sm border border-base-200 flex flex-col justify-between min-h-[96px]">
            <span className="text-xs font-semibold text-base-content/70 leading-tight">
              {t('dashboard.todayMovements', "Today's Moves")}
            </span>
            <span className="text-2xl sm:text-3xl font-black text-emerald-600 my-1">
              {stats.todayMovements}
            </span>
            <span className="text-[10px] text-base-content/50 font-medium">
              IN / OUT
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
