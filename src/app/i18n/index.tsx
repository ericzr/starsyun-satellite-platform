import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { zh, type Translation } from './zh';
import { en } from './en';
import { ar } from './ar';
import { es } from './es';

// Supported languages
export type Lang = 'zh' | 'en' | 'ar' | 'es' | 'fr' | 'pt' | 'ru' | 'ja' | 'ko' | 'de';

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
type DeepPartial<T> = T extends (...args: infer Args) => infer Result
  ? (...args: Args) => Result
  : T extends object
    ? { [Key in keyof T]?: DeepPartial<T[Key]> }
    : string;

function mergeDictionary(base: Dict, override: DeepPartial<Dict>): Dict {
  const output: Record<string, unknown> = { ...base };
  Object.entries(override).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const baseValue = (base as unknown as Record<string, unknown>)[key];
      output[key] = mergeDictionary(
        baseValue as Dict,
        value as DeepPartial<Dict>,
      );
    } else if (value !== undefined) {
      output[key] = value;
    }
  });
  return output as Dict;
}

// Import all language dictionaries
// For languages without full translation, fallback to English
const dictionaries: Record<Lang, Dict> = {
  zh,
  en,
  ar: mergeDictionary(en, ar),
  es: mergeDictionary(en, es),
  fr: en, // TODO: Add French translation
  pt: en, // TODO: Add Portuguese translation
  ru: en, // TODO: Add Russian translation
  ja: en, // TODO: Add Japanese translation
  ko: en, // TODO: Add Korean translation
  de: en, // TODO: Add German translation
};

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Dict;
}

const I18nContext = createContext<I18nContextValue | null>(null);

// Detect browser language
function detectBrowserLanguage(): Lang {
  if (typeof navigator === 'undefined') return 'zh';

  const browserLang = navigator.language.toLowerCase();

  // Match exact locale (e.g., 'zh-cn' -> 'zh')
  if (browserLang.startsWith('zh')) return 'zh';
  if (browserLang.startsWith('en')) return 'en';
  if (browserLang.startsWith('ar')) return 'ar';
  if (browserLang.startsWith('es')) return 'es';
  if (browserLang.startsWith('fr')) return 'fr';
  if (browserLang.startsWith('pt')) return 'pt';
  if (browserLang.startsWith('ru')) return 'ru';
  if (browserLang.startsWith('ja')) return 'ja';
  if (browserLang.startsWith('ko')) return 'ko';
  if (browserLang.startsWith('de')) return 'de';

  // Default to English for unsupported languages
  return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('orbitdata-lang') as Lang;
      if (saved && LANGUAGES[saved]) return saved;
    }
    // Auto-detect browser language
    return detectBrowserLanguage();
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('orbitdata-lang', l);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    document.documentElement.lang = lang;
    // Set RTL direction for Arabic
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
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
