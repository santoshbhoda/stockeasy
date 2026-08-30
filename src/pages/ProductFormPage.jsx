import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import toast from 'react-hot-toast';

import db, { registerProduct } from '../lib/db';
import BarcodeScanner from '../components/BarcodeScanner';

export default function ProductFormPage() {
  const { barcode: urlBarcode } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const isBarcodeFixed = Boolean(urlBarcode);

  const [formData, setFormData] = useState({
    barcode: urlBarcode || '',
    name: '',
    brand: '',
    model: '',
    category_id: '',
    mrp: '',
    purchasePrice: '',
    reorderLevel: 5
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  // Reactive categories query from Dexie DB
  const categories = useLiveQuery(() => db.categories.toArray(), []) || [];

  // Update barcode if url params change
  useEffect(() => {
    if (urlBarcode) {
      setFormData((prev) => ({ ...prev, barcode: urlBarcode }));
    }
  }, [urlBarcode]);

  // Set default category if categories exist and not selected
  useEffect(() => {
    if (categories.length > 0 && !formData.category_id) {
      setFormData((prev) => ({ ...prev, category_id: categories[0].id }));
    }
  }, [categories, formData.category_id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleScanComplete = (scannedCode) => {
    if (scannedCode) {
      setFormData((prev) => ({ ...prev, barcode: scannedCode.trim() }));
      setShowScanner(false);
      toast.success(t('scanner.scanSuccess', 'Barcode scanned successfully'));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) {
      newErrors.name = t('product.nameRequired', 'Product Name is required');
    }
    if (!formData.brand.trim()) {
      newErrors.brand = t('product.brandRequired', 'Brand is required');
    }
    if (!formData.category_id) {
      newErrors.category_id = t('product.categoryRequired', 'Category is required');
    }
    if (formData.reorderLevel === '' || isNaN(Number(formData.reorderLevel)) || Number(formData.reorderLevel) < 0) {
      newErrors.reorderLevel = t('product.invalidReorderLevel', 'Enter a valid reorder level');
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error(t('common.error', 'Please fill in all required fields'));
      return;
    }

    setIsSubmitting(true);
    try {
      const productPayload = {
        barcode: formData.barcode ? String(formData.barcode).trim() : '',
        name: formData.name.trim(),
        brand: formData.brand.trim(),
        model: formData.model ? formData.model.trim() : '',
        category_id: formData.category_id,
        price: formData.mrp ? Number(formData.mrp) : 0,
        mrp: formData.mrp ? Number(formData.mrp) : 0,
        cost_price: formData.purchasePrice ? Number(formData.purchasePrice) : 0,
        purchase_price: formData.purchasePrice ? Number(formData.purchasePrice) : 0,
        min_stock_level: Number(formData.reorderLevel) || 5,
        reorder_level: Number(formData.reorderLevel) || 5,
        is_active: true
      };

      const createdProduct = await registerProduct(productPayload);

      toast.success(t('product.registered', 'Product registered!'));

      // If user came from a barcode scan or want to immediately add stock, navigate to stock-in
      if (createdProduct) {
        navigate('/stock-in', {
          state: {
            barcode: createdProduct.barcode,
            product: createdProduct
          }
        });
      } else {
        navigate(-1);
      }
    } catch (err) {
      console.error('Failed to register product:', err);
      toast.error(err.message || t('common.error', 'Failed to register product'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-base-content">
            {t('product.register', 'Register New Product')}
          </h1>
          <p className="text-sm text-base-content/70">
            {t('product.addNew', 'Add a new product to inventory catalog')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="btn btn-ghost btn-circle btn-md min-h-[48px] min-w-[48px]"
          aria-label={t('common.back', 'Back')}
        >
          ✕
        </button>
      </div>

      {/* Barcode Scanner Modal */}
      {showScanner && (
        <BarcodeScanner
          onScan={handleScanComplete}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Form Container */}
      <form onSubmit={handleSubmit} className="card bg-base-100 shadow-md border border-base-200 rounded-3xl p-5 space-y-4">
        
        {/* 1. Barcode Field */}
        <div className="form-control w-full">
          <label className="label py-1">
            <span className="label-text font-semibold text-base">
              {t('product.barcode', 'Barcode')}
            </span>
            {isBarcodeFixed && (
              <span className="label-text-alt badge badge-info badge-sm">
                From Scanner
              </span>
            )}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              name="barcode"
              value={formData.barcode}
              readOnly={isBarcodeFixed}
              onChange={handleChange}
              placeholder={t('stockIn.scanBarcode', 'Scan or enter barcode')}
              className={`input input-bordered input-lg w-full font-mono text-base rounded-2xl min-h-[48px] ${
                isBarcodeFixed ? 'bg-base-200 cursor-not-allowed text-base-content/80' : ''
              }`}
            />
            {!isBarcodeFixed && (
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                className="btn btn-primary btn-lg rounded-2xl min-h-[48px] px-4 flex items-center gap-1.5 shadow-sm"
                title={t('stockIn.scanBarcode', 'Scan')}
              >
                <span className="text-xl">📷</span>
                <span className="hidden sm:inline">{t('stockIn.scanBarcode', 'Scan')}</span>
              </button>
            )}
          </div>
        </div>

        {/* 2. Product Name Field (Required) */}
        <div className="form-control w-full">
          <label className="label py-1">
            <span className="label-text font-semibold text-base">
              {t('product.name', 'Product Name')} <span className="text-error">*</span>
            </span>
          </label>
          <input
            type="text"
            name="name"
            required
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g. Samsung Galaxy S24 Ultra"
            className={`input input-bordered input-lg w-full rounded-2xl min-h-[48px] ${
              errors.name ? 'input-error' : ''
            }`}
          />
          {errors.name && (
            <span className="text-error text-xs mt-1 ml-1">{errors.name}</span>
          )}
        </div>

        {/* 3. Brand & Model Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Brand (Required) */}
          <div className="form-control w-full">
            <label className="label py-1">
              <span className="label-text font-semibold text-base">
                {t('product.brand', 'Brand')} <span className="text-error">*</span>
              </span>
            </label>
            <input
              type="text"
              name="brand"
              required
              value={formData.brand}
              onChange={handleChange}
              placeholder="e.g. Samsung, Apple, Boat"
              className={`input input-bordered input-lg w-full rounded-2xl min-h-[48px] ${
                errors.brand ? 'input-error' : ''
              }`}
            />
            {errors.brand && (
              <span className="text-error text-xs mt-1 ml-1">{errors.brand}</span>
            )}
          </div>

          {/* Model (Optional) */}
          <div className="form-control w-full">
            <label className="label py-1">
              <span className="label-text font-semibold text-base">
                {t('product.model', 'Model')}
              </span>
              <span className="label-text-alt text-base-content/50">Optional</span>
            </label>
            <input
              type="text"
              name="model"
              value={formData.model}
              onChange={handleChange}
              placeholder="e.g. SM-S928B, 256GB"
              className="input input-bordered input-lg w-full rounded-2xl min-h-[48px]"
            />
          </div>
        </div>

        {/* 4. Category Dropdown (Required) */}
        <div className="form-control w-full">
          <label className="label py-1">
            <span className="label-text font-semibold text-base">
              {t('product.category', 'Category')} <span className="text-error">*</span>
            </span>
          </label>
          <select
            name="category_id"
            required
            value={formData.category_id}
            onChange={handleChange}
            className={`select select-bordered select-lg w-full rounded-2xl min-h-[48px] text-base ${
              errors.category_id ? 'select-error' : ''
            }`}
          >
            <option value="" disabled>
              -- {t('product.selectCategory', 'Select Category')} --
            </option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.icon ? `${cat.icon} ` : ''}{cat.name}
              </option>
            ))}
            {categories.length === 0 && (
              <>
                <option value="mobiles">📱 Mobiles & Smartphones</option>
                <option value="accessories">🔌 Accessories & Cables</option>
                <option value="audio">🎧 Audio & Headphones</option>
                <option value="laptops">💻 Laptops & Computers</option>
                <option value="general">📦 General Electronics</option>
              </>
            )}
          </select>
          {errors.category_id && (
            <span className="text-error text-xs mt-1 ml-1">{errors.category_id}</span>
          )}
        </div>

        {/* 5. MRP & Purchase Price (with ₹ prefix) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* MRP */}
          <div className="form-control w-full">
            <label className="label py-1">
              <span className="label-text font-semibold text-base">
                {t('product.mrp', 'MRP (Selling Price)')}
              </span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-base-content/60">
                ₹
              </span>
              <input
                type="number"
                name="mrp"
                min="0"
                step="any"
                inputMode="decimal"
                value={formData.mrp}
                onChange={handleChange}
                placeholder="0.00"
                className="input input-bordered input-lg w-full pl-9 rounded-2xl min-h-[48px] font-semibold"
              />
            </div>
          </div>

          {/* Purchase Price */}
          <div className="form-control w-full">
            <label className="label py-1">
              <span className="label-text font-semibold text-base">
                {t('product.purchasePrice', 'Purchase Price')}
              </span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-base-content/60">
                ₹
              </span>
              <input
                type="number"
                name="purchasePrice"
                min="0"
                step="any"
                inputMode="decimal"
                value={formData.purchasePrice}
                onChange={handleChange}
                placeholder="0.00"
                className="input input-bordered input-lg w-full pl-9 rounded-2xl min-h-[48px] font-semibold"
              />
            </div>
          </div>
        </div>

        {/* 6. Reorder Level */}
        <div className="form-control w-full">
          <label className="label py-1">
            <span className="label-text font-semibold text-base">
              {t('product.reorderLevel', 'Reorder Level')}
            </span>
            <span className="label-text-alt text-base-content/60">
              Alert when stock drops below this
            </span>
          </label>
          <input
            type="number"
            name="reorderLevel"
            min="0"
            inputMode="numeric"
            value={formData.reorderLevel}
            onChange={handleChange}
            className={`input input-bordered input-lg w-full rounded-2xl min-h-[48px] font-semibold ${
              errors.reorderLevel ? 'input-error' : ''
            }`}
          />
          {errors.reorderLevel && (
            <span className="text-error text-xs mt-1 ml-1">{errors.reorderLevel}</span>
          )}
        </div>

        {/* Submit Button (min 48px, btn-lg, large touch target) */}
        <div className="pt-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn btn-primary btn-block btn-lg min-h-[52px] h-14 rounded-2xl text-lg font-bold shadow-lg hover:shadow-primary/30 transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <span className="loading loading-spinner loading-md"></span>
                <span>{t('common.loading', 'Saving...')}</span>
              </>
            ) : (
              <>
                <span>💾</span>
                <span>{t('product.register', 'Register Product')}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
