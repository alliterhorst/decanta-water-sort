import { DEFAULT_LANG, type Lang } from './types';

/** Detects the browser's preferred language (navigator.languages, falling back to
 *  navigator.language). 'pt' maps any Portuguese variant (pt-PT, pt-AO...) to 'pt-BR';
 *  'en'/'es' map any regional variant (en-US, en-GB, es-MX, es-AR...). No match →
 *  DEFAULT_LANG ('pt-BR', the game's "home" language). */
export function detectBrowserLang(): Lang {
  const raw = typeof navigator !== 'undefined'
    ? (navigator.languages?.length ? navigator.languages : [navigator.language])
    : [];
  for (const tag of raw) {
    if (!tag) continue;
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'pt') return 'pt-BR';
    if (base === 'en') return 'en';
    if (base === 'es') return 'es';
  }
  return DEFAULT_LANG;
}
