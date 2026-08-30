import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import toast from 'react-hot-toast';

import db from '../lib/db';
import { useAuthContext } from '../App';
import ProductCard from '../components/ProductCard';
import BarcodeScanner from '../components/BarcodeScanner';

export default function SearchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userBranchId, profile } = useAuthContext();

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  // 300ms Debounce for search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reactive Dexie query for products, inventory, and categories
  const searchResults = useLiveQuery(async () => {
    const q = (debouncedQuery || '').trim().toLowerCase();

    // 1. Fetch categories for category name mapping
    const categories = await db.categories.toArray();
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));

    // 2. Fetch branches for branch name display
    let resolvedBranchId = profile?.branch_id;
    let branchName = profile?.branch_name || '';
    if (!resolvedBranchId) {
      const firstBranch = await db.branches.toCollection().first();
      if (firstBranch) {
        resolvedBranchId = firstBranch.id;
        branchName = firstBranch.name;
      }
    }

    // 3. Fetch inventory records (filtered by branch)
    let inventoryRecords = [];
    if (resolvedBranchId) {
      inventoryRecords = await db.inventory.where('branch_id').equals(resolvedBranchId).toArray();
    } else {
      inventoryRecords = await db.inventory.toArray();
    }

    const stockMap = new Map();
    for (const inv of inventoryRecords) {
      const current = stockMap.get(inv.product_id) || 0;
      stockMap.set(inv.product_id, current + (Number(inv.quantity) || 0));
    }

    // 4. Query and filter products
    const products = await db.products
      .filter((p) => {
        if (p.is_active === false) return false;
        if (!q) return true;
        const name = (p.name || '').toLowerCase();
        const brand = (p.brand || '').toLowerCase();
        const model = (p.model || '').toLowerCase();
        const barcode = (p.barcode || '').toLowerCase();
        return name.includes(q) || brand.includes(q) || model.includes(q) || barcode.includes(q);
      })
      .toArray();

    return {
      branchName,
      items: products.map((product) => ({
        ...product,
        categoryName: categoryMap.get(product.category_id) || '',
        stock: stockMap.get(product.id) || 0
      }))
    };
  }, [debouncedQuery, userBranchId, profile]);

  const items = searchResults?.items || [];
  const branchName = searchResults?.branchName || '';
  const isLoading = searchResults === undefined;

  const handleScan = (code) => {
    if (code) {
      const trimmed = code.trim();
      setSearchTerm(trimmed);
      setDebouncedQuery(trimmed);
      setShowScanner(false);
      toast.success(t('scanner.scanSuccess', 'Scanned barcode!'));
    }
  };

  const handleClear = () => {
    setSearchTerm('');
    setDebouncedQuery('');
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-base-content">
            {t('dashboard.search', 'Search Products')}
          </h1>
          <p className="text-sm text-base-content/70">
            {t('stockIn.scanPrompt', 'Search by name, brand, model, or scan barcode')}
          </p>
        </div>

        {/* Quick Add Product Button */}
        <button
          type="button"
          onClick={() => navigate('/product/new')}
          className="btn btn-primary btn-sm rounded-xl min-h-[40px] px-3 gap-1 shadow-sm"
        >
          <span>＋</span>
          <span className="hidden xs:inline">{t('product.addNew', 'Add New')}</span>
        </button>
      </div>

      {/* Barcode Scanner Modal */}
      {showScanner && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Search Input Bar & Scan Button */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-base-content/50">
            🔍
          </span>
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('common.search', 'Search by name, brand, or barcode...')}
            className="input input-bordered input-lg w-full pl-11 pr-10 rounded-2xl min-h-[52px] text-base focus:input-primary shadow-sm"
            autoFocus
          />
          {searchTerm && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 btn btn-ghost btn-circle btn-xs min-h-[28px] min-w-[28px] text-base-content/60"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Scan Barcode Button */}
        <button
          type="button"
          onClick={() => setShowScanner(true)}
          className="btn btn-primary btn-lg rounded-2xl min-h-[52px] min-w-[52px] px-4 flex items-center justify-center shadow-sm"
          title={t('stockIn.scanBarcode', 'Scan Barcode')}
        >
          <span className="text-xl">📷</span>
          <span className="hidden sm:inline font-semibold ml-1">
            {t('stockIn.scanBarcode', 'Scan')}
          </span>
        </button>
      </div>

      {/* Results Header / Counter */}
      <div className="flex items-center justify-between text-xs text-base-content/60 px-1">
        <span>
          {searchTerm.trim() ? (
            <>
              Found <strong className="text-base-content">{items.length}</strong> results for &ldquo;{searchTerm}&rdquo;
            </>
          ) : (
            <>
              Total <strong className="text-base-content">{items.length}</strong> active products
            </>
          )}
        </span>
        {branchName && (
          <span className="badge badge-ghost badge-sm text-[11px]">
            📍 {branchName}
          </span>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-12">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="mt-3 text-sm text-base-content/60">{t('common.loading', 'Loading products...')}</p>
        </div>
      )}

      {/* Results List */}
      {!isLoading && items.length > 0 && (
        <div className="space-y-3">
          {items.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              branchStock={product.stock}
              branchName={branchName}
              categoryName={product.categoryName}
              showActions={true}
            />
          ))}
        </div>
      )}

      {/* Empty State: No Results Found */}
      {!isLoading && items.length === 0 && (
        <div className="card bg-base-100 border border-base-200 rounded-3xl p-8 text-center space-y-4 shadow-sm my-4">
          <div className="text-5xl animate-bounce">📦🔍</div>
          <div>
            <h3 className="text-lg font-bold text-base-content">
              {t('common.noResults', 'No results found')}
            </h3>
            <p className="text-sm text-base-content/60 mt-1 max-w-xs mx-auto">
              {searchTerm.trim()
                ? `No products matched "${searchTerm}". You can register it as a new product.`
                : 'No products currently registered in local database.'}
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center max-w-xs mx-auto">
            {searchTerm.trim() && (
              <button
                type="button"
                onClick={() => navigate(`/product/new/${encodeURIComponent(searchTerm.trim())}`)}
                className="btn btn-primary rounded-xl min-h-[48px] font-semibold w-full"
              >
                ＋ {t('product.register', 'Register this Barcode')}
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/product/new')}
              className="btn btn-outline rounded-xl min-h-[48px] font-semibold w-full"
            >
              {t('product.addNew', 'Add New Product')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
