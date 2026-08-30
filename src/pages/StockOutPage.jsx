import React, { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAuthContext } from '../App';
import db, { addStockOut } from '../lib/db';

import BarcodeScanner from '../components/BarcodeScanner';
import ProductCard from '../components/ProductCard';
import QuantityInput from '../components/QuantityInput';

/**
 * StockOutPage Component
 * Scan-first workflow to deduct stock for sales, damage, or returns
 */
export default function StockOutPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  let auth = {};
  try {
    auth = useAuthContext();
  } catch {
    // Auth context fallback
  }
  const { user, profile } = auth;
  const branchId = profile?.branch_id || 'branch-1';
  const userId = user?.id || 'local-user';
  const branchName = profile?.branch_name || 'Main Branch';

  // Workflow states: 'scanning' | 'found' | 'not_found' | 'done'
  const [status, setStatus] = useState('scanning');
  const [isScannerOpen, setIsScannerOpen] = useState(true);
  const [batchMode, setBatchMode] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [currentProduct, setCurrentProduct] = useState(null);
  const [currentStock, setCurrentStock] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('sale'); // 'sale' | 'damaged' | 'returned'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastDeductedInfo, setLastDeductedInfo] = useState(null);

  // Fetch current stock for product at current branch
  const fetchCurrentStock = useCallback(async (productId) => {
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
        console.warn('Error fetching inventory for stock out:', err);
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
      const product = await db.products.where('barcode').equals(cleanCode).first();

      if (product) {
        const stockQty = await fetchCurrentStock(product.id);
        setCurrentProduct(product);
        setCurrentStock(stockQty);
        setQuantity(stockQty > 0 ? 1 : 0);
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

  // Confirm and execute stock deduction
  const handleRemoveStock = async () => {
    if (!currentProduct) return;
    const qtyNumber = Number(quantity);

    if (isNaN(qtyNumber) || qtyNumber <= 0) {
      toast.error(t('stockOut.invalidQuantity', 'Please enter a valid quantity'));
      return;
    }

    if (qtyNumber > currentStock) {
      toast.error(t('stockOut.insufficientStock', 'Insufficient stock available'));
      return;
    }

    setIsSubmitting(true);

    try {
      await addStockOut(currentProduct.id, branchId, qtyNumber, userId, reason);

      const reasonLabel =
        reason === 'damaged'
          ? t('stockOut.damaged', 'Damaged')
          : reason === 'returned'
          ? t('stockOut.returned', 'Returned')
          : t('stockOut.sale', 'Sale');

      toast.success(
        `${t('stockOut.removed', 'Stock removed successfully!')} (-${qtyNumber} ${currentProduct.unit || 'pcs'} • ${reasonLabel})`,
        { icon: '🛒' }
      );

      setLastDeductedInfo({
        productName: currentProduct.name,
        quantity: qtyNumber,
        reason: reasonLabel,
        remainingStock: currentStock - qtyNumber,
      });

      if (batchMode) {
        // Continuous mode: reset and immediately open camera for next product
        setCurrentProduct(null);
        setScannedBarcode('');
        setQuantity(1);
        setStatus('scanning');
        setIsScannerOpen(true);
      } else {
        setStatus('done');
      }
    } catch (err) {
      console.error('Failed to deduct stock:', err);
      toast.error(err.message || t('common.error', 'Failed to deduct stock'));
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

  const isOutOfStock = currentStock <= 0;
  const isExceedingStock = Number(quantity) > currentStock;

  return (
    <div className="space-y-4 pb-12 animate-fadeIn">
      {/* Fullscreen Camera Scanner Modal */}
      {isScannerOpen && (
        <BarcodeScanner
          onScan={(code) => handleBarcodeLookup(code)}
          onClose={() => {
            setIsScannerOpen(false);
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
              <span>🛒</span> {t('stockOut.title', 'Stock Out')}
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
            className="toggle toggle-warning toggle-sm"
          />
        </label>
      </div>

      {/* STATE 1: SCANNING / MANUAL ENTRY FALLBACK */}
      {status === 'scanning' && !isScannerOpen && (
        <div className="card bg-base-100 shadow-md border border-base-200 p-5 rounded-3xl text-center space-y-5">
          <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center text-3xl mx-auto">
            🛒
          </div>
          <div>
            <h2 className="text-xl font-bold text-base-content">
              {t('stockOut.scanPrompt', 'Scan Barcode to Deduct')}
            </h2>
            <p className="text-xs sm:text-sm text-base-content/60 mt-1 max-w-xs mx-auto">
              {t('stockIn.scanPrompt', 'Point camera at product barcode or type the code below')}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="btn btn-warning btn-block btn-lg h-14 rounded-2xl text-base font-bold shadow-lg shadow-warning/20 active:scale-95 transition-all text-white"
          >
            📷 {t('scanner.openCamera', 'Open Camera Scanner')}
          </button>

          <div className="divider text-xs text-base-content/40 uppercase">OR TYPE BARCODE</div>

          {/* Manual Barcode Form */}
          <form onSubmit={handleManualSubmit} className="space-y-3">
            <div className="join w-full">
              <input
                type="text"
                inputMode="numeric"
                placeholder={t('scanner.enterBarcode', 'Enter barcode digits')}
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="input input-bordered input-md join-item w-full bg-base-200/50 font-mono text-sm focus:input-warning"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="btn btn-warning join-item px-5 font-bold text-white"
              >
                {t('common.search', 'Find')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STATE 2: PRODUCT FOUND -> DEDUCTION FORM */}
      {status === 'found' && currentProduct && (
        <div className="space-y-4 animate-slideUp">
          {/* Prominent Current Stock Alert Card */}
          <div
            className={`card shadow-sm border rounded-3xl p-4 sm:p-5 flex items-center justify-between gap-4 ${
              isOutOfStock
                ? 'bg-error/15 border-error/30 text-error-content'
                : currentStock <= 5
                ? 'bg-warning/15 border-warning/30 text-warning-content'
                : 'bg-base-100 border-base-200 text-base-content'
            }`}
          >
            <div>
              <span className="text-xs font-bold uppercase tracking-wider block opacity-70">
                {t('stockOut.currentStock', 'Current Stock Available')}
              </span>
              <span className="text-xs opacity-60">{branchName}</span>
            </div>
            <div className="text-right">
              <span
                className={`text-3xl sm:text-4xl font-black ${
                  isOutOfStock
                    ? 'text-error'
                    : currentStock <= 5
                    ? 'text-warning font-extrabold'
                    : 'text-primary'
                }`}
              >
                {currentStock}
              </span>
              <span className="text-xs font-semibold ml-1 opacity-70">
                {currentProduct.unit || 'pcs'}
              </span>
            </div>
          </div>

          {/* Product Details Card */}
          <ProductCard
            product={currentProduct}
            currentStock={currentStock}
            branchName={branchName}
          />

          {/* Out of Stock Warning */}
          {isOutOfStock ? (
            <div className="alert alert-error rounded-2xl shadow-sm text-sm py-3 px-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{t('product.outOfStock', 'This product is out of stock in this branch!')}</span>
            </div>
          ) : (
            <div className="card bg-base-100 shadow-md border border-base-200 rounded-3xl p-4 sm:p-5 space-y-4">
              {/* Quantity Selector */}
              <div>
                <label className="text-sm font-bold text-base-content block mb-2">
                  {t('stockOut.removeQuantity', 'Quantity to Remove')}
                </label>
                <QuantityInput
                  value={quantity}
                  onChange={(val) => setQuantity(val)}
                  min={1}
                  max={currentStock}
                  unit={currentProduct.unit || 'pcs'}
                />
              </div>

              {/* Insufficient Stock Warning */}
              {isExceedingStock && (
                <div className="alert alert-warning py-2 text-xs rounded-xl">
                  <span>⚠️ {t('stockOut.insufficientStock', 'Insufficient stock available')}</span>
                </div>
              )}

              {/* Reason Selector: 3 Large Radio Cards */}
              <div className="space-y-2 pt-1">
                <label className="text-xs font-bold text-base-content/80 uppercase tracking-wider">
                  {t('stockOut.reason', 'Reason for Stock Out')}
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    {
                      id: 'sale',
                      icon: '🛒',
                      title: t('stockOut.sale', 'Sale / Purchase'),
                      subtitle: 'Customer Sale',
                      color: 'border-blue-500 bg-blue-500/10 text-blue-950 dark:text-blue-200',
                    },
                    {
                      id: 'damaged',
                      icon: '💔',
                      title: t('stockOut.damaged', 'Damaged / Broken'),
                      subtitle: 'Write-off / Loss',
                      color: 'border-red-500 bg-red-500/10 text-red-950 dark:text-red-200',
                    },
                    {
                      id: 'returned',
                      icon: '↩️',
                      title: t('stockOut.returned', 'Vendor Return'),
                      subtitle: 'Supplier Return',
                      color: 'border-amber-500 bg-amber-500/10 text-amber-950 dark:text-amber-200',
                    },
                  ].map((item) => {
                    const isSelected = reason === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setReason(item.id)}
                        className={`flex items-center sm:flex-col sm:justify-center p-3 rounded-2xl border-2 text-left sm:text-center transition-all min-h-[56px] active:scale-95 ${
                          isSelected
                            ? `${item.color} shadow-sm font-bold ring-2 ring-primary/40`
                            : 'border-base-300 bg-base-200/50 text-base-content/80 hover:bg-base-200'
                        }`}
                      >
                        <span className="text-2xl mr-3 sm:mr-0 sm:mb-1">{item.icon}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-extrabold truncate">{item.title}</div>
                          <div className="text-[11px] opacity-70 truncate">{item.subtitle}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Submit Remove Stock Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleRemoveStock}
                  disabled={isSubmitting || isOutOfStock || isExceedingStock || Number(quantity) <= 0}
                  className="btn btn-warning btn-block btn-lg h-14 rounded-2xl text-white font-bold text-base sm:text-lg shadow-lg shadow-warning/30 active:scale-98 transition-all disabled:opacity-40"
                >
                  {isSubmitting ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="loading loading-spinner loading-md"></span>
                      {t('common.saving', 'Deducting Stock...')}
                    </span>
                  ) : (
                    `− ${t('stockOut.confirmRemove', 'Remove')} ${quantity || 0} ${currentProduct.unit || 'pcs'}`
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
          )}
        </div>
      )}

      {/* STATE 3: PRODUCT NOT FOUND */}
      {status === 'not_found' && (
        <div className="card bg-base-100 shadow-xl border border-error/30 rounded-3xl p-6 text-center space-y-4 animate-scaleUp">
          <div className="w-16 h-16 bg-error/15 text-error rounded-2xl flex items-center justify-center text-3xl mx-auto">
            🚫
          </div>

          <div>
            <h2 className="text-xl font-extrabold text-base-content">
              {t('stockOut.notFoundTitle', 'Product Not Registered')}
            </h2>
            <p className="text-xs sm:text-sm text-base-content/70 mt-1 max-w-xs mx-auto">
              {t('stockOut.notFoundDesc', 'Cannot deduct stock because this barcode is not in inventory.')}
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
              onClick={resetToScanner}
              className="btn btn-primary btn-block btn-lg h-14 rounded-2xl text-base font-bold shadow-lg shadow-primary/30 active:scale-95 transition-all"
            >
              🔄 {t('stockIn.scanAgain', 'Scan Another Item')}
            </button>

            <Link
              to="/"
              className="btn btn-ghost btn-block text-sm font-semibold text-base-content/70"
            >
              🏠 {t('nav.home', 'Back to Dashboard')}
            </Link>
          </div>
        </div>
      )}

      {/* STATE 4: SUCCESS / DONE */}
      {status === 'done' && (
        <div className="card bg-base-100 shadow-xl border border-success/30 rounded-3xl p-6 text-center space-y-5 animate-scaleUp">
          <div className="w-16 h-16 bg-success/15 text-success rounded-full flex items-center justify-center text-3xl mx-auto animate-bounce">
            ✅
          </div>

          <div>
            <h2 className="text-2xl font-black text-base-content">
              {t('stockOut.removedSuccess', 'Stock Deducted!')}
            </h2>
            {lastDeductedInfo && (
              <div className="bg-base-200/70 rounded-2xl p-4 mt-3 border border-base-300 text-left space-y-1">
                <div className="font-bold text-base text-base-content truncate">
                  {lastDeductedInfo.productName}
                </div>
                <div className="text-xs text-warning font-semibold">
                  −{lastDeductedInfo.quantity} units ({lastDeductedInfo.reason})
                </div>
                <div className="text-xs text-base-content/70 font-mono pt-1 border-t border-base-300">
                  Remaining Stock: <strong>{lastDeductedInfo.remainingStock} units</strong>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              onClick={resetToScanner}
              className="btn btn-warning btn-block btn-lg h-14 rounded-2xl text-white text-base font-bold shadow-lg shadow-warning/30 active:scale-95 transition-all"
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
