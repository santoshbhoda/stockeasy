import React, { useRef, useEffect, useCallback } from 'react';

/**
 * Mobile-first QuantityInput component with large +/- buttons and rapid long-press support.
 *
 * @param {Object} props
 * @param {number} props.value - Current quantity value
 * @param {Function} props.onChange - Callback fired when quantity changes (receives new number)
 * @param {number} [props.min=1] - Minimum allowable quantity
 * @param {number} [props.max=9999] - Maximum allowable quantity
 * @param {string} [props.label] - Optional label above the control
 * @param {string} [props.className] - Optional extra container CSS
 */
export default function QuantityInput({
  value = 1,
  onChange,
  min = 1,
  max = 9999,
  label,
  className = '',
}) {
  const numericValue = typeof value === 'number' ? value : parseInt(value, 10) || min;

  // Refs for tracking values during rapid long-press intervals
  const valueRef = useRef(numericValue);
  valueRef.current = numericValue;

  const timerRef = useRef(null);
  const intervalRef = useRef(null);

  // Clear timers
  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  // Step adjustment logic
  const step = useCallback(
    (delta) => {
      const current = valueRef.current;
      const next = Math.min(max, Math.max(min, current + delta));
      if (next !== current && onChange) {
        onChange(next);
      }
    },
    [min, max, onChange]
  );

  // Start long-press handler
  const handlePointerDown = (delta) => {
    clearTimers();
    // Immediate first step
    step(delta);

    // Initial delay before continuous stepping begins
    timerRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        const current = valueRef.current;
        if ((delta > 0 && current >= max) || (delta < 0 && current <= min)) {
          clearTimers();
          return;
        }
        step(delta);
      }, 70);
    }, 350);
  };

  const isMinDisabled = numericValue <= min;
  const isMaxDisabled = numericValue >= max;

  return (
    <div className={`flex flex-col items-center select-none ${className}`}>
      {/* Optional Label */}
      {label && (
        <label className="text-sm font-semibold text-base-content/80 mb-2.5 text-center">
          {label}
        </label>
      )}

      {/* Button and display row */}
      <div className="flex items-center justify-center gap-4 sm:gap-6">
        {/* Decrement Button */}
        <button
          type="button"
          disabled={isMinDisabled}
          onPointerDown={() => !isMinDisabled && handlePointerDown(-1)}
          onPointerUp={clearTimers}
          onPointerLeave={clearTimers}
          onPointerCancel={clearTimers}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Decrease quantity"
          className="btn btn-circle btn-lg text-2xl font-bold btn-outline border-2 border-base-300 hover:border-primary hover:bg-primary hover:text-primary-content active:scale-90 transition-all touch-manipulation disabled:opacity-30 disabled:pointer-events-none"
        >
          −
        </button>

        {/* Quantity Display */}
        <div
          className="min-w-16 sm:min-w-20 px-2 py-1 flex items-center justify-center"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="text-3xl sm:text-4xl font-extrabold text-base-content tracking-tight text-center font-mono">
            {numericValue}
          </span>
        </div>

        {/* Increment Button */}
        <button
          type="button"
          disabled={isMaxDisabled}
          onPointerDown={() => !isMaxDisabled && handlePointerDown(1)}
          onPointerUp={clearTimers}
          onPointerLeave={clearTimers}
          onPointerCancel={clearTimers}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Increase quantity"
          className="btn btn-circle btn-lg text-2xl font-bold btn-primary text-primary-content active:scale-90 transition-all touch-manipulation disabled:opacity-30 disabled:pointer-events-none"
        >
          +
        </button>
      </div>
    </div>
  );
}
