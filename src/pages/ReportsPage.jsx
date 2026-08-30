import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

import db from '../lib/db';
import { useAuthContext } from '../App';
import StockBadge from '../components/StockBadge';
import ProductCard from '../components/ProductCard';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const CHART_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#84cc16'  // lime
];

export default function ReportsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userBranchId } = useAuthContext();

  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'lowStock' | 'movements'

  // Tab 1: Stock Summary reactive data
  const summaryData = useLiveQuery(async () => {
    const [categories, inventory, products] = await Promise.all([
      db.categories.toArray(),
      db.inventory.toArray(),
      db.products.toArray()
    ]);

    const productMap = new Map(products.map(p => [p.id, p]));
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));

    const categoryStockMap = new Map();
    let totalUnits = 0;
    let totalEstimatedValue = 0;

    for (const inv of inventory) {
      const qty = Number(inv.quantity) || 0;
      totalUnits += qty;

      const prod = productMap.get(inv.product_id);
      if (prod) {
        const catId = prod.category_id || 'uncategorized';
        const catName = prod.category_id ? (categoryMap.get(prod.category_id) || 'Unknown') : 'General';
        
        const current = categoryStockMap.get(catId) || { name: catName, quantity: 0, count: 0 };
        current.quantity += qty;
        current.count += 1;
        categoryStockMap.set(catId, current);

        const price = prod.price || prod.mrp || 0;
        totalEstimatedValue += (qty * Number(price));
      }
    }

    const labels = [];
    const quantities = [];
    const categoryStats = [];

    categoryStockMap.forEach((val) => {
      labels.push(val.name);
      quantities.push(val.quantity);
      categoryStats.push(val);
    });

    return {
      labels,
      quantities,
      totalUnits,
      totalEstimatedValue,
      totalCategories: categoryStats.length,
      categoryStats
    };
  }, []);

  // Tab 2: Low Stock Items reactive data
  const lowStockData = useLiveQuery(async () => {
    const [products, inventory, categories, branches] = await Promise.all([
      db.products.toArray(),
      db.inventory.toArray(),
      db.categories.toArray(),
      db.branches.toArray()
    ]);

    const productMap = new Map(products.map(p => [p.id, p]));
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));
    const branchMap = new Map(branches.map(b => [b.id, b.name]));

    const lowStockItems = [];

    for (const inv of inventory) {
      const product = productMap.get(inv.product_id);
      if (!product || product.is_active === false) continue;

      const qty = Number(inv.quantity) || 0;
      const reorderLevel = Number(inv.min_stock_level ?? product.min_stock_level ?? product.reorder_level ?? 5);

      if (qty <= reorderLevel) {
        lowStockItems.push({
          ...product,
          inventoryId: inv.id,
          branchId: inv.branch_id,
          branchName: branchMap.get(inv.branch_id) || 'Main Branch',
          categoryName: categoryMap.get(product.category_id) || '',
          quantity: qty,
          reorderLevel
        });
      }
    }

    // Sort by most critically low stock first
    return lowStockItems.sort((a, b) => a.quantity - b.quantity);
  }, []);

  // Tab 3: Recent Movements reactive data (last 50)
  const movementsData = useLiveQuery(async () => {
    const movements = await db.stockMovements
      .orderBy('created_at')
      .reverse()
      .limit(50)
      .toArray();

    if (!movements || movements.length === 0) return [];

    const productIds = [...new Set(movements.map(m => m.product_id).filter(Boolean))];
    const branchIds = [...new Set(movements.map(m => m.branch_id).filter(Boolean))];

    const [products, branches] = await Promise.all([
      db.products.where('id').anyOf(productIds).toArray(),
      db.branches.where('id').anyOf(branchIds).toArray()
    ]);

    const productMap = new Map(products.map(p => [p.id, p]));
    const branchMap = new Map(branches.map(b => [b.id, b.name]));

    return movements.map(m => {
      const prod = productMap.get(m.product_id);
      return {
        ...m,
        productName: prod ? prod.name : 'Unknown Product',
        productBrand: prod ? prod.brand : '',
        productBarcode: prod ? prod.barcode : '',
        branchName: branchMap.get(m.branch_id) || 'Branch'
      };
    });
  }, []);

  // Chart configuration
  const chartData = {
    labels: summaryData?.labels || [],
    datasets: [
      {
        label: t('reports.stockSummary', 'Stock Quantity'),
        data: summaryData?.quantities || [],
        backgroundColor: CHART_COLORS.slice(0, (summaryData?.labels?.length || 1)),
        borderRadius: 8,
        borderSkipped: false,
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: '#1f2937',
        titleFont: { size: 13, weight: 'bold' },
        bodyFont: { size: 12 },
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (context) => ` ${context.parsed.y} units in stock`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0,
          font: { size: 11 }
        },
        grid: {
          color: 'rgba(156, 163, 175, 0.15)'
        }
      },
      x: {
        ticks: {
          font: { size: 11 },
          maxRotation: 45,
          minRotation: 0
        },
        grid: {
          display: false
        }
      }
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-base-content">
          {t('reports.title', 'Stock Reports')}
        </h1>
        <p className="text-sm text-base-content/70">
          Real-time stock breakdown and activity history
        </p>
      </div>

      {/* Tabs Navigation (min 48px touch height) */}
      <div className="tabs tabs-boxed bg-base-300 p-1.5 rounded-2xl grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          className={`tab min-h-[46px] h-11 rounded-xl font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-1 ${
            activeTab === 'summary' ? 'tab-active bg-primary text-primary-content shadow-sm' : 'text-base-content/70'
          }`}
        >
          <span>📊</span>
          <span>{t('reports.stockSummary', 'Summary')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('lowStock')}
          className={`tab min-h-[46px] h-11 rounded-xl font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-1 ${
            activeTab === 'lowStock' ? 'tab-active bg-warning text-warning-content shadow-sm' : 'text-base-content/70'
          }`}
        >
          <span>⚠️</span>
          <span>{t('reports.lowStock', 'Low Stock')}</span>
          {lowStockData && lowStockData.length > 0 && (
            <span className="badge badge-error badge-xs text-[10px] text-white ml-0.5">
              {lowStockData.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('movements')}
          className={`tab min-h-[46px] h-11 rounded-xl font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-1 ${
            activeTab === 'movements' ? 'tab-active bg-primary text-primary-content shadow-sm' : 'text-base-content/70'
          }`}
        >
          <span>⏱️</span>
          <span>{t('reports.movements', 'Movements')}</span>
        </button>
      </div>

      {/* SECTION 1: Stock Summary */}
      {activeTab === 'summary' && (
        <div className="space-y-4">
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="card bg-base-100 border border-base-200 shadow-sm p-4 rounded-2xl">
              <span className="text-xs text-base-content/60 font-medium uppercase tracking-wider">
                Total Stock
              </span>
              <div className="text-2xl sm:text-3xl font-black text-primary mt-1">
                {summaryData?.totalUnits?.toLocaleString('en-IN') || 0}
              </div>
              <span className="text-[11px] text-base-content/50 mt-0.5">Units in inventory</span>
            </div>

            <div className="card bg-base-100 border border-base-200 shadow-sm p-4 rounded-2xl">
              <span className="text-xs text-base-content/60 font-medium uppercase tracking-wider">
                Stock Value
              </span>
              <div className="text-2xl sm:text-3xl font-black text-success mt-1 truncate">
                ₹{Math.round(summaryData?.totalEstimatedValue || 0).toLocaleString('en-IN')}
              </div>
              <span className="text-[11px] text-base-content/50 mt-0.5">Est. Retail Value</span>
            </div>
          </div>

          {/* Bar Chart Card */}
          <div className="card bg-base-100 border border-base-200 shadow-sm p-4 rounded-3xl">
            <h3 className="font-bold text-base text-base-content mb-3 flex items-center gap-2">
              <span>📊</span>
              <span>Stock by Category</span>
            </h3>

            {summaryData?.labels && summaryData.labels.length > 0 ? (
              <div className="h-64 w-full">
                <Bar data={chartData} options={chartOptions} />
              </div>
            ) : (
              <div className="py-12 text-center text-base-content/50">
                <div className="text-3xl mb-2">📦</div>
                <p className="text-sm">No inventory recorded yet.</p>
              </div>
            )}
          </div>

          {/* Category Breakdown List */}
          {summaryData?.categoryStats && summaryData.categoryStats.length > 0 && (
            <div className="card bg-base-100 border border-base-200 shadow-sm p-4 rounded-3xl space-y-2">
              <h3 className="font-bold text-sm text-base-content/80 mb-1">
                Category Breakdown
              </h3>
              <div className="divide-y divide-base-200">
                {summaryData.categoryStats.map((cat, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                      />
                      <span className="font-medium">{cat.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold">{cat.quantity}</span>
                      <span className="text-xs text-base-content/60 ml-1">units</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: Low Stock Items */}
      {activeTab === 'lowStock' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-base-content/70 uppercase tracking-wider">
              {t('reports.lowStock', 'Low Stock Alert')} ({lowStockData?.length || 0})
            </span>
            <span className="text-xs text-base-content/50">
              Quantity &le; Reorder Level
            </span>
          </div>

          {lowStockData && lowStockData.length > 0 ? (
            <div className="space-y-3">
              {lowStockData.map((item) => (
                <div
                  key={`${item.id}-${item.branchId}`}
                  className="card bg-base-100 border border-warning/30 shadow-md rounded-2xl p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="badge badge-neutral text-xs font-semibold uppercase">
                          {item.brand}
                        </span>
                        {item.categoryName && (
                          <span className="badge badge-ghost text-xs">
                            {item.categoryName}
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-base text-base-content mt-1">
                        {item.name}
                      </h4>
                      {item.model && (
                        <p className="text-xs text-base-content/60">Model: {item.model}</p>
                      )}
                    </div>
                    <StockBadge quantity={item.quantity} reorderLevel={item.reorderLevel} />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-base-200 text-xs">
                    <div className="text-base-content/70">
                      <span>Threshold: <strong>{item.reorderLevel}</strong></span>
                      {item.branchName && (
                        <span className="ml-2">📍 {item.branchName}</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => navigate('/stock-in', { state: { product: item, barcode: item.barcode } })}
                      className="btn btn-warning btn-sm rounded-xl min-h-[38px] font-semibold text-warning-content px-3"
                    >
                      📥 {t('dashboard.stockIn', 'Restock Now')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card bg-base-100 border border-base-200 rounded-3xl p-8 text-center space-y-2 shadow-sm">
              <div className="text-5xl">🎉</div>
              <h3 className="font-bold text-lg text-success">All Stock Levels Healthy!</h3>
              <p className="text-sm text-base-content/60 max-w-xs mx-auto">
                No products are currently at or below their reorder thresholds.
              </p>
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: Recent Movements */}
      {activeTab === 'movements' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-base-content/70 uppercase tracking-wider">
              {t('reports.movements', 'Stock Movements')} (Last 50)
            </span>
          </div>

          {movementsData && movementsData.length > 0 ? (
            <div className="space-y-2.5">
              {movementsData.map((m) => {
                const isStockIn = (m.type || '').toUpperCase() === 'IN';
                return (
                  <div
                    key={m.id}
                    className="card bg-base-100 border border-base-200 shadow-sm rounded-2xl p-3.5 flex flex-row items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-lg flex-shrink-0 ${
                          isStockIn
                            ? 'bg-success/15 text-success'
                            : 'bg-warning/15 text-warning'
                        }`}
                      >
                        {isStockIn ? '📥' : '📤'}
                      </div>

                      <div className="min-w-0">
                        <div className="font-bold text-sm text-base-content truncate">
                          {m.productName}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-base-content/60 mt-0.5">
                          <span>{formatDate(m.created_at)}</span>
                          {m.reason && (
                            <>
                              <span>•</span>
                              <span className="capitalize">{m.reason}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div
                        className={`font-black text-base ${
                          isStockIn ? 'text-success' : 'text-warning'
                        }`}
                      >
                        {isStockIn ? `+${m.quantity}` : `-${m.quantity}`}
                      </div>
                      <span className="text-[10px] badge badge-ghost badge-xs">
                        {m.branchName}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card bg-base-100 border border-base-200 rounded-3xl p-8 text-center space-y-2 shadow-sm">
              <div className="text-4xl">⏱️</div>
              <h3 className="font-bold text-base text-base-content">No Movements Recorded</h3>
              <p className="text-sm text-base-content/60">
                Stock In and Stock Out transactions will appear here.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
