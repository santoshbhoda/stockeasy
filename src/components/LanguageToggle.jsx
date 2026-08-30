import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Toggle button component to quickly switch language between English and Telugu.
 * Formats as 'EN | తె' with active language highlighted and large touch targets for mobile.
 *
 * @param {Object} props
 * @param {string} [props.className] - Optional additional CSS classes
 */
export default function LanguageToggle({ className = '' }) {
  const { i18n } = useTranslation();

  // Check if current language is English (default fallback)
  const isEn = !i18n.language || i18n.language.startsWith('en');

  const handleToggle = () => {
    const nextLang = isEn ? 'te' : 'en';
    i18n.changeLanguage(nextLang);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('stockeasy_lang', nextLang);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={`Current language: ${isEn ? 'English' : 'Telugu'}. Click to switch to ${isEn ? 'Telugu' : 'English'}.`}
      title={isEn ? 'తెలుగుకు మార్చండి' : 'Switch to English'}
      className={`btn btn-ghost min-h-[48px] h-12 px-3.5 py-1.5 rounded-full border border-base-300 bg-base-100/90 hover:bg-base-200 shadow-xs active:scale-95 transition-all select-none gap-2 flex items-center justify-center ${className}`}
    >
      <span className="text-base leading-none" role="img" aria-hidden="true">
        🌐
      </span>
      <div className="flex items-center gap-1 text-sm font-sans tracking-wide">
        <span
          className={`transition-colors duration-150 ${
            isEn
              ? 'text-primary font-extrabold underline underline-offset-4 decoration-2'
              : 'text-base-content/40 font-medium'
          }`}
        >
          EN
        </span>
        <span className="text-base-content/30 font-light" aria-hidden="true">
          |
        </span>
        <span
          className={`transition-colors duration-150 ${
            !isEn
              ? 'text-primary font-extrabold underline underline-offset-4 decoration-2'
              : 'text-base-content/40 font-medium'
          }`}
        >
          తె
        </span>
      </div>
    </button>
  );
}
