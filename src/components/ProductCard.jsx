import React from 'react';
import StockBadge from './StockBadge';

/**
 * Formats a number as Indian Rupee (INR) currency.
 * @param {number|string} price
 * @returns {string}
 */
function formatCurrency(price) {
  const num = Number(price);
  if (isNaN(num)) return `₹${price}`;
  return `₹${num.toLocaleString('en-IN')}`;
}

/**
 * Mobile-first ProductCard component to display product details and stock status.
 *
 * @param {Object} props
 * @param {Object} props.product - Product data object
 * @param {string} props.product.name - Name of product
 * @param {string} [props.product.brand] - Brand name
 * @param {string} [props.product.model] - Model/Specification
 * @param {string} [props.product.barcode] - Barcode identifier
 * @param {number|string} [props.product.mrp] - Maximum retail price
 * @param {string} [props.product.category_name] - Category name
 * @param {number} [props.stock] - Current stock count (optional, can fallback to product.stock)
 * @param {number} [props.reorderLevel] - Reorder threshold (optional)
 * @param {Function} [props.onClick] - Click handler for card
 * @param {string} [props.className] - Optional container classes
 */
export default function ProductCard({
  product = {},
  stock,
  reorderLevel,
  onClick,
  className = '',
}) {
  const {
    name = 'Unnamed Product',
    brand,
    model,
    barcode,
    mrp,
    category_name,
  } = product;

  // Determine stock quantity
  const currentStock =
    stock !== undefined && stock !== null
      ? stock
      : product.stock !== undefined && product.stock !== null
      ? product.stock
      : product.quantity !== undefined && product.quantity !== null
      ? product.quantity
      : undefined;

  const currentReorder =
    reorderLevel !== undefined && reorderLevel !== null
      ? reorderLevel
      : product.reorder_level !== undefined && product.reorder_level !== null
      ? product.reorder_level
      : product.reorderLevel !== undefined && product.reorderLevel !== null
      ? product.reorderLevel
      : 5;

  const hasBrandOrModel = Boolean(brand || model);
  const brandModelText = [brand, model].filter(Boolean).join(' • ');

  const handleKeyDown = (e) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick(product);
    }
  };

  return (
    <div
      onClick={onClick ? () => onClick(product) : undefined}
      onKeyDown={onClick ? handleKeyDown : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `View details for ${name}` : undefined}
      className={`card bg-base-100 border border-base-200 shadow-xs hover:shadow-md transition-all duration-150 ${
        onClick ? 'cursor-pointer active:scale-[0.99] select-none' : ''
      } ${className}`}
    >
      <div className="card-body p-3.5 sm:p-4 gap-2">
        {/* Top row: Name & Stock Badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3
              className="font-bold text-base text-base-content leading-snug truncate"
              title={name}
            >
              {name}
            </h3>

            {/* Brand + Model */}
            {hasBrandOrModel && (
              <p className="text-sm text-base-content/70 truncate mt-0.5">
                {brandModelText}
              </p>
            )}
          </div>

          {/* Stock status badge */}
          {currentStock !== undefined && (
            <div className="shrink-0">
              <StockBadge
                quantity={currentStock}
                reorderLevel={currentReorder}
              />
            </div>
          )}
        </div>

        {/* Bottom row: Barcode, Category & MRP */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-base-200/60 mt-1">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            {/* Barcode in monospace */}
            {barcode && (
              <span
                className="font-mono text-xs text-base-content/80 bg-base-200/80 px-2 py-0.5 rounded tracking-wide truncate max-w-[150px] sm:max-w-[200px]"
                title={`Barcode: ${barcode}`}
              >
                🏷️ {barcode}
              </span>
            )}

            {/* Category tag */}
            {category_name && (
              <span className="badge badge-ghost badge-sm text-[11px] text-base-content/60 px-2">
                {category_name}
              </span>
            )}
          </div>

          {/* MRP Price */}
          {mrp !== undefined && mrp !== null && mrp !== '' && (
            <div className="shrink-0 text-right">
              <span className="text-xs text-base-content/60 block leading-none">
                MRP
              </span>
              <span className="font-bold text-sm sm:text-base text-primary">
                {formatCurrency(mrp)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
