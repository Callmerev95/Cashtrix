/**
 * System-category display names (C6, ADR-0008) — the Jest seam.
 *
 * The 12 system categories live as Indonesian rows in Postgres (shared
 * across users, never per-user copies). They are *data*, so they are not
 * string literals any screen can move into the dictionary directly; instead
 * this maps a DB name back to its dictionary key and renders the active
 * language. Custom categories, wallet names and notes are user data and are
 * never translated — an unmatched name passes through untouched.
 */
import { dictionaryFor } from './dictionaries';
import type { Language } from './locale';
import { id } from './id';

export type SystemCategoryKind = 'expense' | 'income';

export function translateSystemCategory(
  kind: SystemCategoryKind,
  dbName: string,
  lang: Language = 'id',
): string {
  const source = id.categories[kind] as Record<string, string>;
  const target = dictionaryFor(lang).categories[kind] as Record<
    string,
    string
  >;
  const hit = Object.keys(source).find((key) => source[key] === dbName);
  return hit ? (target[hit] ?? dbName) : dbName;
}
