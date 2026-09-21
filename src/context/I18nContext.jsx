import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { en, vi } from '../i18n/locales';

const STORAGE_KEY = 'televault_locale';

export function readCachedLocale() {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached === 'en' || cached === 'vi') return cached;
  } catch {
    // ignore
  }
  return 'vi';
}

const I18nContext = createContext({ t: vi, locale: 'vi', setLocale: () => {} });

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(readCachedLocale);

  // Sync with electron database settings if localStorage is not set
  useEffect(() => {
    void window.televault?.settings?.get?.().then((result) => {
      if (result?.ok && result.locale) {
        try {
          const cached = localStorage.getItem(STORAGE_KEY);
          if (!cached && (result.locale === 'en' || result.locale === 'vi')) {
            setLocaleState(result.locale);
          }
        } catch {
          // ignore
        }
      }
    });
  }, []);

  const setLocale = useCallback((nextLocale) => {
    const valid = nextLocale === 'en' ? 'en' : 'vi';
    setLocaleState(valid);
    try {
      localStorage.setItem(STORAGE_KEY, valid);
    } catch {
      // ignore
    }
    void window.televault?.settings?.set?.({ locale: valid });
  }, []);

  const value = useMemo(() => {
    const dict = locale === 'en' ? en : vi;
    return {
      locale,
      setLocale,
      t: (key, params = {}) => {
        let text = dict[key] ?? key;
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{${k}}`, String(v));
        }
        return text;
      },
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

