/**
 * Language-keyed dictionary access (C6). Leaf module — no React, no native
 * bridge — so pure domain modules (`validation.ts`, `domain.ts`) can render
 * the central dictionary without pulling the hook layer.
 */
import { en } from './en';
import { id, type Dictionary } from './id';
import type { Language } from './locale';

export function dictionaryFor(language: Language): Dictionary {
  return language === 'en' ? en : id;
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
