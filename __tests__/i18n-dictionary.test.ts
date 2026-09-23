/**
 * i18n foundation tests (C6, ADR-0008) — the Jest seam.
 *
 * Locks: OS-locale resolution with Indonesian fallback, `Intl` tag mapping,
 * `{param}` interpolation, and full ID↔EN dictionary parity (a key missing
 * or blank on either side fails here, never as a blank string on device).
 */
import {
  detectLanguage,
  deviceLanguageTag,
  dictionaryFor,
  en,
  fill,
  id,
  localeTagFor,
  resolveLanguage,
} from '@/i18n';

describe('resolveLanguage (C6)', () => {
  it.each([
    ['en-US', 'en'],
    ['en', 'en'],
    ['EN-GB', 'en'],
    ['en_US', 'en'],
    ['id-ID', 'id'],
    ['id', 'id'],
    ['fr-FR', 'id'],
    ['', 'id'],
  ])('%p → %p', (tag, expected) => {
    expect(resolveLanguage(tag)).toBe(expected);
  });

  it('null/undefined → id (fallback, never blank)', () => {
    expect(resolveLanguage(null)).toBe('id');
    expect(resolveLanguage(undefined)).toBe('id');
  });
});

describe('localeTagFor (R10: formatting follows language)', () => {
  it("id → 'id-ID', en → 'en-US'", () => {
    expect(localeTagFor('id')).toBe('id-ID');
    expect(localeTagFor('en')).toBe('en-US');
  });
});

describe('fill ({param} interpolation)', () => {
  it('replaces known params, keeps unknown placeholders', () => {
    expect(fill('Budget {categoryName} hampir habis', { categoryName: 'Makanan' })).toBe(
      'Budget Makanan hampir habis',
    );
    expect(fill('Terpakai {spent} dari {limit}', { spent: '80rb' })).toBe(
      'Terpakai 80rb dari {limit}',
    );
  });
});

function leafPaths(obj: unknown, prefix = ''): string[] {
  if (typeof obj === 'string') return [prefix];
  if (obj && typeof obj === 'object') {
    return Object.entries(obj).flatMap(([key, value]) =>
      leafPaths(value, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [`${prefix}!<${typeof obj}>`];
}

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (acc, key) =>
      acc && typeof acc === 'object'
        ? (acc as Record<string, unknown>)[key]
        : undefined,
    obj,
  );
}

function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe('dictionary parity id ↔ en (C6)', () => {
  const idPaths = leafPaths(id).sort();
  const enPaths = leafPaths(en).sort();

  it('identical key sets — no key missing on either side', () => {
    expect(enPaths).toEqual(idPaths);
  });

  it('every leaf is a non-empty string in both languages', () => {
    for (const path of idPaths) {
      for (const dict of [id, en]) {
        const value = getPath(dict, path);
        expect(typeof value).toBe('string');
        expect((value as string).length).toBeGreaterThan(0);
      }
    }
  });

  it('identical {param} sets per template — interpolation cannot break', () => {
    for (const path of idPaths) {
      expect(placeholders(getPath(en, path) as string)).toEqual(
        placeholders(getPath(id, path) as string),
      );
    }
  });

  it('dictionaryFor returns the matching dictionary', () => {
    expect(dictionaryFor('id')).toBe(id);
    expect(dictionaryFor('en')).toBe(en);
  });
});

describe('device locale stand-in (C6)', () => {
  it('default mock is Indonesian → detectLanguage is id', () => {
    expect(deviceLanguageTag()).toBe('id-ID');
    expect(detectLanguage()).toBe('id');
  });
});
