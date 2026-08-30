import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAuthContext } from '../App';
import db, { addStockIn } from '../lib/db';

import BarcodeScanner from '../components/BarcodeScanner';
import ProductCard from '../components/ProductCard';
import QuantityInput from '../components/QuantityInput';

/**
 * StockInPage Component
 * Scan-first workflow to rapidly receive stock items into local & cloud inventory
 */
export default function StockInPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  let auth = {};
  try {
    auth = useAuthContext();
  } catch {
    // Auth context fallback
  }
  const { user, profile } = auth;
  const [resolvedBranchId, setResolvedBranchId] = useState(profile?.branch_id || null);
  const [resolvedBranchName, setResolvedBranchName] = useState(profile?.branch_name || 'Main Store');
  const userId = user?.id || null;

  useEffect(() => {
    async function resolveBranch() {
      if (profile?.branch_id) {
        setResolvedBranchId(profile.branch_id);
        const b = await db.branches.get(profile.branch_id);
        if (b?.name) setResolvedBranchName(b.name);
      } else {
        const firstBranch = await db.branches.toCollection().first();
        if (firstBranch?.id) {
          setResolvedBranchId(firstBranch.id);
          if (firstBranch.name) setResolvedBranchName(firstBranch.name);
        }
      }
    }
    resolveBranch();
  }, [profile?.branch_id]);

  const branchId = resolvedBranchId;
  const branchName = resolvedBranchName;

  // Workflow states: 'scanning' | 'found' | 'not_found' | 'done'
  const [status, setStatus] = useState('scanning');
  const [isScannerOpen, setIsScannerOpen] = useState(true);
  const [batchMode, setBatchMode] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [currentProduct, setCurrentProduct] = useState(null);
  const [currentStock, setCurrentStock] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('purchase');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastAddedInfo, setLastAddedInfo] = useState(null);

  // Fetch current stock for product at current branch
  const fetchCurrentStock = useCallback(async (productId) => {
    if (!productId || !branchId) return 0;
    try {
      const inv = await db.inventory
        .where('[product_id+branch_id]')
        .equals([productId, branchId])
        .first();
      return Number(inv?.quantity) || 0;
    } catch {
      try {
        const invArray = await db.inventory.where('product_id').equals(productId).toArray();
        const branchInv = invArray.find((i) => i.branch_id === branchId);
        return Number(branchInv?.quantity) || 0;
      } catch (err) {
        console.warn('Error fetching inventory for product:', err);
        return 0;
      }
    }
  }, [branchId]);

  // Handle scanned or entered barcode
  const handleBarcodeLookup = useCallback(async (code) => {
    if (!code || typeof code !== 'string') return;
    const cleanCode = code.trim();
    if (!cleanCode) return;

    setScannedBarcode(cleanCode);
    setIsScannerOpen(false);

    try {
      // Find the product by checking exact match, or variations with leading zero
      const allProducts = await db.products.toArray();
      const product = allProducts.find(p => 
        p.barcode === cleanCode || 
        p.barcode === `0${cleanCode}` || 
        `0${p.barcode}` === cleanCode
      );

      if (product) {
        const stockQty = await fetchCurrentStock(product.id);
        setCurrentProduct(product);
        setCurrentStock(stockQty);
        setQuantity(1);
        setStatus('found');
      } else {
        setCurrentProduct(null);
        setStatus('not_found');
      }
    } catch (err) {
      console.error('Error looking up barcode:', err);
      toast.error(t('common.error', 'Error searching product'));
      setStatus('scanning');
      setIsScannerOpen(true);
    }
  }, [fetchCurrentStock, t]);

  // Confirm and save stock in
  const handleAddStock = async () => {
    if (!currentProduct) return;
    const qtyNumber = Number(quantity);

    if (isNaN(qtyNumber) || qtyNumber <= 0) {
      toast.error(t('stockIn.invalidQuantity', 'Please enter a valid quantity greater than 0'));
      return;
    }

    setIsSubmitting(true);

    try {
      await addStockIn(currentProduct.id, branchId, qtyNumber, userId, reason);

      toast.success(
        `${t('stockIn.added', 'Stock added successfully!')} (+${qtyNumber} ${currentProduct.unit || 'pcs'})`,
        { icon: '📦' }
      );

      setLastAddedInfo({
        productName: currentProduct.name,
        quantity: qtyNumber,
        newStock: currentStock + qtyNumber,
      });

      if (batchMode) {
        // Continuous scanning: immediately reset and open scanner for next item
        setCurrentProduct(null);
        setScannedBarcode('');
        setQuantity(1);
        setStatus('scanning');
        setIsScannerOpen(true);
      } else {
        setStatus('done');
      }
    } catch (err) {
      console.error('Failed to add stock in:', err);
      toast.error(err.message || t('common.error', 'Failed to add stock'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetToScanner = () => {
    setCurrentProduct(null);
    setScannedBarcode('');
    setManualCode('');
    setQuantity(1);
    setStatus('scanning');
    setIsScannerOpen(true);
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualCode.trim()) {
      handleBarcodeLookup(manualCode.trim());
    }
  };

  return (
    <div className="space-y-4 pb-12 animate-fadeIn">
      {/* Fullscreen Camera Scanner Modal */}
      {isScannerOpen && (
        <BarcodeScanner
          onScan={(code) => handleBarcodeLookup(code)}
          onClose={() => {
            setIsScannerOpen(false);
            if (status === 'scanning') {
              // Stay in scanning state but show manual entry fallback
            }
          }}
          continuous={false}
        />
      )}

      {/* Top Header & Batch Mode Bar */}
      <div className="bg-base-100 p-3.5 sm:p-4 rounded-2xl shadow-sm border border-base-200 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="btn btn-ghost btn-circle btn-sm text-base-content/80 hover:bg-base-200"
            aria-label="Back to Dashboard"
          >
            ←
          </Link>
          <div>
            <h1 className="text-lg sm:text-xl font-bold flex items-center gap-1.5 text-base-content">
              <span>📦</span> {t('stockIn.title', 'Stock In')}
            </h1>
            <p className="text-xs text-base-content/60 font-medium">
              {branchName}
            </p>
          </div>
        </div>

        {/* Batch Mode Switch */}
        <label className="label cursor-pointer gap-2 bg-base-200/80 px-3 py-1.5 rounded-xl border border-base-300">
          <span className="label-text text-xs font-bold whitespace-nowrap">
            {t('stockIn.batchMode', 'Batch Mode')}
          </span>
          <input
            type="checkbox"
            checked={batchMode}
            onChange={(e) => setBatchMode(e.target.checked)}
            className="toggle toggle-primary toggle-sm"
          />
        </label>
      </div>

      {/* STATE 1: SCANNING / MANUAL ENTRY FALLBACK */}
      {status === 'scanning' && !isScannerOpen && (
        <div className="card bg-base-100 shadow-md border border-base-200 p-5 rounded-3xl text-center space-y-5">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center text-3xl mx-auto">
            📷
          </div>
          <div>
            <h2 className="text-xl font-bold text-base-content">
              {t('stockIn.scanBarcode', 'Scan Barcode')}
            </h2>
            <p className="text-xs sm:text-sm text-base-content/60 mt-1 max-w-xs mx-auto">
              {t('stockIn.scanPrompt', 'Point camera at product barcode or type the code below')}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="btn btn-primary btn-block btn-lg h-14 rounded-2xl text-base font-bold shadow-lg shadow-primary/20 active:scale-95 transition-all"
          >
            📷 {t('scanner.openCamera', 'Open Camera Scanner')}
          </button>

          <div className="divider text-xs text-base-content/40 uppercase">OR TYPE BARCODE</div>

          {/* Manual Barcode Input */}
          <form onSubmit={handleManualSubmit} className="space-y-3">
            <div className="join w-full">
              <input
                type="text"
                inputMode="numeric"
                placeholder={t('scanner.enterBarcode', 'Enter barcode digits')}
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="input input-bordered input-md join-item w-full bg-base-200/50 font-mono text-sm focus:input-primary"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="btn btn-primary join-item px-5 font-bold"
              >
                {t('common.search', 'Find')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STATE 2: PRODUCT FOUND -> QUANTITY & CONFIRM */}
      {status === 'found' && currentProduct && (
        <div className="space-y-4 animate-slideUp">
          {/* Product details card */}
          <ProductCard
            product={currentProduct}
            currentStock={currentStock}
            branchName={branchName}
          />

          {/* Quantity Section */}
          <div className="card bg-base-100 shadow-md border border-base-200 rounded-3xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-base-content">
                {t('stockIn.addQuantity', 'Quantity to Add')}
              </label>
              <span className="text-xs text-base-content/60 font-mono">
                Current: <strong className="text-base-content">{currentStock}</strong> {currentProduct.unit || 'pcs'}
              </span>
            </div>

            <QuantityInput
              value={quantity}
              onChange={(val) => setQuantity(val)}
              min={1}
              unit={currentProduct.unit || 'pcs'}
            />

            {/* Quick Reason / Source Tag */}
            <div className="pt-2">
              <label className="text-xs font-semibold text-base-content/70 block mb-1.5">
                {t('stockIn.sourceReason', 'Stock Source / Reason')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'purchase', label: '🛒 Purchase' },
                  { id: 'transfer', label: '🚚 Transfer' },
                  { id: 'return', label: '↩️ Return' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setReason(item.id)}
                    className={`btn btn-sm rounded-xl text-xs font-bold transition-all min-h-[38px] ${
                      reason === item.id
                        ? 'btn-primary text-white shadow-sm'
                        : 'btn-ghost bg-base-200 text-base-content/80'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit Add Stock Button */}
            <div className="pt-3">
              <button
                type="button"
                onClick={handleAddStock}
                disabled={isSubmitting || Number(quantity) <= 0}
                className="btn btn-success btn-block btn-lg h-14 rounded-2xl text-white font-bold text-base sm:text-lg shadow-lg shadow-success/30 active:scale-98 transition-all"
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="loading loading-spinner loading-md"></span>
                    {t('common.saving', 'Adding Stock...')}
                  </span>
                ) : (
                  `+ ${t('stockIn.confirmAdd', 'Add')} ${quantity || 0} ${currentProduct.unit || 'pcs'} ${t('stockIn.toInventory', 'to Stock')}`
                )}
              </button>
            </div>

            {/* Cancel / Scan Different Item */}
            <button
              type="button"
              onClick={resetToScanner}
              className="btn btn-ghost btn-sm btn-block text-base-content/60 font-medium"
            >
              ← {t('stockIn.scanDifferent', 'Scan a different item')}
            </button>
          </div>
        </div>
      )}

      {/* STATE 3: PRODUCT NOT FOUND */}
      {status === 'not_found' && (
        <div className="card bg-base-100 shadow-xl border border-warning/30 rounded-3xl p-6 text-center space-y-4 animate-scaleUp">
          <div className="w-16 h-16 bg-warning/15 text-warning rounded-2xl flex items-center justify-center text-3xl mx-auto">
            ❓
          </div>

          <div>
            <h2 className="text-xl font-extrabold text-base-content">
              {t('product.newProduct', 'New Product Detected')}
            </h2>
            <p className="text-xs sm:text-sm text-base-content/70 mt-1 max-w-xs mx-auto">
              {t('product.notFoundPrompt', 'This barcode is not registered in the system yet.')}
            </p>
          </div>

          {scannedBarcode && (
            <div className="inline-block bg-base-200 font-mono text-sm px-4 py-2 rounded-xl border border-base-300 text-base-content font-bold">
              {scannedBarcode}
            </div>
          )}

          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={() => navigate(`/product/new/${encodeURIComponent(scannedBarcode)}`)}
              className="btn btn-primary btn-block btn-lg h-14 rounded-2xl text-base font-bold shadow-lg shadow-primary/30 active:scale-95 transition-all"
            >
              ➕ {t('product.register', 'Register New Product')}
            </button>

            <button
              type="button"
              onClick={resetToScanner}
              className="btn btn-ghost btn-block text-sm font-semibold text-base-content/70"
            >
              🔄 {t('stockIn.scanAgain', 'Scan Another Barcode')}
            </button>
          </div>
        </div>
      )}

      {/* STATE 4: SUCCESS / DONE (When not in batch mode) */}
      {status === 'done' && (
        <div className="card bg-base-100 shadow-xl border border-success/30 rounded-3xl p-6 text-center space-y-5 animate-scaleUp">
          <div className="w-16 h-16 bg-success/15 text-success rounded-full flex items-center justify-center text-3xl mx-auto animate-bounce">
            ✅
          </div>

          <div>
            <h2 className="text-2xl font-black text-base-content">
              {t('stockIn.addedSuccess', 'Stock Added!')}
            </h2>
            {lastAddedInfo && (
              <div className="bg-base-200/70 rounded-2xl p-4 mt-3 border border-base-300 text-left space-y-1">
                <div className="font-bold text-base text-base-content truncate">
                  {lastAddedInfo.productName}
                </div>
                <div className="text-xs text-success font-semibold">
                  +{lastAddedInfo.quantity} units added
                </div>
                <div className="text-xs text-base-content/70 font-mono pt-1 border-t border-base-300">
                  New Stock Balance: <strong>{lastAddedInfo.newStock} units</strong>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              onClick={resetToScanner}
              className="btn btn-primary btn-block btn-lg h-14 rounded-2xl text-base font-bold shadow-lg shadow-primary/30 active:scale-95 transition-all"
            >
              📷 {t('stockIn.scanNext', 'Scan Next Product')}
            </button>

            <Link
              to="/"
              className="btn btn-outline btn-block rounded-2xl h-12 text-sm font-semibold"
            >
              🏠 {t('nav.home', 'Back to Dashboard')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
