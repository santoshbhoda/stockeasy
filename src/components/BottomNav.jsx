import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const NAV_ITEMS = [
  { path: '/', labelKey: 'nav.home', defaultLabel: 'Home', icon: '🏠' },
  { path: '/stock-in', labelKey: 'nav.stockIn', defaultLabel: 'Stock In', icon: '📦' },
  { path: '/search', labelKey: 'nav.search', defaultLabel: 'Search', icon: '🔍' },
  { path: '/reports', labelKey: 'nav.reports', defaultLabel: 'Reports', icon: '📊' },
  { path: '/settings', labelKey: 'nav.settings', defaultLabel: 'Settings', icon: '⚙️' },
];

/**
 * Mobile bottom navigation bar for StockEasy.
 * Features 5 main tabs, active tab indicators, safe-area padding,
 * i18n support, and minimum 48px touch targets.
 */
export default function BottomNav() {
  const location = useLocation();
  const { t } = useTranslation();

  const isTabActive = (itemPath) => {
    if (itemPath === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(itemPath);
  };

  return (
    <nav
      aria-label="Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-50 bg-base-100 border-t border-base-300 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-stretch justify-around max-w-md mx-auto sm:max-w-lg md:max-w-xl h-16 px-1">
        {NAV_ITEMS.map((item) => {
          const active = isTabActive(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center flex-1 min-h-[48px] min-w-0 py-1 select-none transition-colors active:scale-95 ${
                active
                  ? 'text-primary font-bold'
                  : 'text-base-content/50 active:text-base-content/80 font-medium'
              }`}
            >
              <span
                className={`text-xl leading-none transition-transform duration-150 ${
                  active ? 'scale-110' : ''
                }`}
                role="img"
                aria-label={t(item.labelKey, item.defaultLabel)}
              >
                {item.icon}
              </span>
              <span className="text-[11px] leading-tight truncate w-full text-center mt-1 px-0.5">
                {t(item.labelKey, item.defaultLabel)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
