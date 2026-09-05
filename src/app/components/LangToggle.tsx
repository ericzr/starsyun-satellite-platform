import { Languages, Check, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useI18n, LANGUAGES, type Lang } from '../i18n';
import { Button } from './ui/button';

export function LangToggle() {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Primary languages (shown first)
  const primaryLangs: Lang[] = ['zh', 'en'];

  // Other languages (shown after separator)
  const otherLangs: Lang[] = ['ar', 'es', 'fr', 'pt', 'ru', 'ja', 'ko', 'de'];

  const handleSelect = (l: Lang) => {
    setLang(l);
    setOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="sm"
        className="h-9 gap-1.5 rounded-md border border-border px-3 text-xs"
        onClick={() => setOpen(!open)}
      >
        <Languages className="size-4" />
        <span className="hidden sm:inline">{LANGUAGES[lang].nativeName}</span>
        <ChevronDown className="size-3 opacity-50" />
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-md border border-border bg-popover p-2 shadow-md">
          <div className="space-y-1">
            {primaryLangs.map((l) => (
              <button
                key={l}
                onClick={() => handleSelect(l)}
                className="flex w-full cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <span>{LANGUAGES[l].nativeName}</span>
                {lang === l && <Check className="size-4 text-primary" />}
              </button>
            ))}
          </div>
          <div className="my-1 h-px bg-border" />
          <div className="space-y-1">
            {otherLangs.map((l) => (
              <button
                key={l}
                onClick={() => handleSelect(l)}
                className="flex w-full cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <span>{LANGUAGES[l].nativeName}</span>
                {lang === l && <Check className="size-4 text-primary" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
