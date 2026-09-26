import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { zh, type Translation } from './zh';
import { en } from './en';

// Languages understood by platform data (for example administrative names).
// This is intentionally broader than the languages exposed by the website.
export type Lang = 'zh' | 'en' | 'ar' | 'es' | 'fr' | 'pt' | 'ru' | 'ja' | 'ko' | 'de';

// A language is only exposed after every customer-facing flow has been
// translated and reviewed. Partial dictionaries must never make an English
// interface look like a completed localization.
export const PUBLIC_LANGUAGE_CODES = ['zh', 'en'] as const;
export type PublicLang = (typeof PUBLIC_LANGUAGE_CODES)[number];

export function isPublicLanguage(value: unknown): value is PublicLang {
  return typeof value === 'string' && PUBLIC_LANGUAGE_CODES.some((lang) => lang === value);
}

// Language display names
export const LANGUAGES: Record<Lang, { name: string; nativeName: string }> = {
  zh: { name: 'Chinese', nativeName: '简体中文' },
  en: { name: 'English', nativeName: 'English' },
  ar: { name: 'Arabic', nativeName: 'العربية' },
  es: { name: 'Spanish', nativeName: 'Español' },
  fr: { name: 'French', nativeName: 'Français' },
  pt: { name: 'Portuguese', nativeName: 'Português' },
  ru: { name: 'Russian', nativeName: 'Русский' },
  ja: { name: 'Japanese', nativeName: '日本語' },
  ko: { name: 'Korean', nativeName: '한국어' },
  de: { name: 'German', nativeName: 'Deutsch' },
};

type Dict = Translation;
const dictionaries: Record<PublicLang, Dict> = {
  zh,
  en,
};

interface I18nContextValue {
  lang: PublicLang;
  setLang: (l: PublicLang) => void;
  t: Dict;
}

const I18nContext = createContext<I18nContextValue | null>(null);

// Detect browser language
function detectBrowserLanguage(): PublicLang {
  if (typeof navigator === 'undefined') return 'zh';

  const browserLang = navigator.language.toLowerCase();

  // Only select reviewed website languages. Other browser locales use the
  // complete English experience until their dictionaries pass launch review.
  if (browserLang.startsWith('zh')) return 'zh';
  return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<PublicLang>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('orbitdata-lang');
      if (isPublicLanguage(saved)) return saved;
    }
    // Auto-detect browser language
    return detectBrowserLanguage();
  });

  const setLang = (l: PublicLang) => {
    setLangState(l);
    try {
      localStorage.setItem('orbitdata-lang', l);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = 'ltr';
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t: dictionaries[lang] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

/** Pick a localized value from a multilingual object. */
export function useLocale() {
  const { lang } = useI18n();
  return function loc(values: Partial<Record<Lang, string>>) {
    return values[lang] || values.en || values.zh || Object.values(values)[0] || '';
  };
}
