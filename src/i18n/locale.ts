/**
 * Locale resolution (C6, ADR-0008) — pure, the Jest seam.
 *
 * The UI language follows the OS locale with Indonesian fallback: anything
 * that is not recognisably English resolves to `'id'`, so a missing or
 * unexpected locale tag can never render a half-empty English UI.
 */
import { useState } from 'react';

import { en } from './en';
import { id, type Dictionary } from './id';

export type Language = 'id' | 'en';

/** Dictionary for an explicitly resolved language. */
export function dictionaryFor(language: Language): Dictionary {
  return language === 'en' ? en : id;
}

/** BCP-47 tag whose first subtag is `en` (case-insensitive) → English. */
export function resolveLanguage(tag: string | null | undefined): Language {
  if (!tag) return 'id';
  const first = tag.trim().split(/[-_]/)[0]?.toLowerCase();
  return first === 'en' ? 'en' : 'id';
}

/** `Intl` locale tag for the active language (R10: formatting follows it). */
export function localeTagFor(language: Language): string {
  return language === 'en' ? 'en-US' : 'id-ID';
}

/** Minimal `{param}` interpolation — mirrors the dictionary templates. */
export function fill(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

type LocalesResult = {
  languageTag?: string;
  languageCode?: string;
  locale?: string;
}[];

/**
 * Best-effort OS locale tag. `expo-localization` is loaded lazily and every
 * access is guarded: absent module (Expo Go without it, Jest, web), a
 * throwing native bridge, or an unexpected shape all degrade to `null`
 * instead of crashing the JS loop (same lesson as notifications.ts).
 */
export function deviceLanguageTag(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-localization') as {
      getLocales?: () => LocalesResult;
      locale?: string;
    };
    const locales = mod.getLocales?.();
    const first = Array.isArray(locales) ? locales[0] : undefined;
    const tag = first?.languageTag ?? first?.languageCode ?? mod.locale;
    return typeof tag === 'string' && tag.length > 0 ? tag : null;
  } catch {
    return null;
  }
}

/** Active language, resolved once per mount (no provider — see ADR-0008). */
export function detectLanguage(): Language {
  return resolveLanguage(deviceLanguageTag());
}

/** React seam for the active language. */
export function useLanguage(): Language {
  const [language] = useState<Language>(() => detectLanguage());
  return language;
}
