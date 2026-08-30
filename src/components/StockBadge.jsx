import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Colored badge showing stock status.
 *
 * @param {Object} props
 * @param {number} props.quantity - Current stock level
 * @param {number} [props.reorderLevel=5] - Reorder threshold
 * @param {string} [props.className] - Optional extra class names
 */
export default function StockBadge({ quantity, reorderLevel = 5, className = '' }) {
  const { t } = useTranslation();

  if (quantity === undefined || quantity === null) return null;

  const qty = typeof quantity === 'number' ? quantity : parseInt(quantity, 10) || 0;
  const reorder = typeof reorderLevel === 'number' ? reorderLevel : 5;

  if (qty <= 0) {
    return (
      <span
        className={`badge badge-error gap-1 text-xs font-semibold py-2.5 px-2.5 whitespace-nowrap ${className}`}
      >
        <span>🔴</span>
        <span>{t('stockBadge.outOfStock', 'Out of Stock')}</span>
      </span>
    );
  }

  if (qty <= reorder) {
    return (
      <span
        className={`badge badge-warning gap-1 text-xs font-semibold py-2.5 px-2.5 whitespace-nowrap ${className}`}
      >
        <span>🟡</span>
        <span>
          {t('stockBadge.lowStock', {
            count: qty,
            defaultValue: `Low Stock (${qty})`,
          })}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`badge badge-success gap-1 text-xs font-semibold py-2.5 px-2.5 whitespace-nowrap ${className}`}
    >
      <span>🟢</span>
      <span>
        {t('stockBadge.inStock', {
          count: qty,
          defaultValue: `In Stock (${qty})`,
        })}
      </span>
    </span>
  );
}
