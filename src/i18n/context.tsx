import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Dictionary, Lang } from './types';
import { LOCALES } from './locales';
import { detectBrowserLang } from './detect';
import { loadPrefs, savePrefs } from '../game/settings';

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Dictionary;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/** Resolve the initial language: saved preference (if valid) → browser detection. On the first
 *  run (no saved preference yet), it persists the detected result immediately — so the player sees
 *  the SAME language on every later visit, even if they change the browser language afterward. */
function resolveInitialLang(): Lang {
  const saved = loadPrefs().lang;
  if (saved && saved in LOCALES) return saved;
  const detected = detectBrowserLang();
  savePrefs({ ...loadPrefs(), lang: detected });
  return detected;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(resolveInitialLang);

  const setLang = (next: Lang) => {
    setLangState(next);
    savePrefs({ ...loadPrefs(), lang: next });
  };

  const value = useMemo<LanguageContextValue>(
    () => ({ lang, setLang, t: LOCALES[lang] }),
    [lang],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

function useLanguageContext(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useT()/useLanguage() must be used inside <LanguageProvider>');
  return ctx;
}

/** Text dictionary for the CURRENT language — `t.menu.jornada`, `t.common.moedas(5)`, etc. */
export function useT(): Dictionary {
  return useLanguageContext().t;
}

/** Current language + setter (used by the language selector in Settings). */
export function useLanguage(): { lang: Lang; setLang: (lang: Lang) => void } {
  const { lang, setLang } = useLanguageContext();
  return { lang, setLang };
}
