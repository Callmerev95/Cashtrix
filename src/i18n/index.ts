/**
 * i18n entry point (C6, ADR-0008): central dictionaries + locale resolution.
 * Screens take `useLanguage()` and index the matching dictionary; nothing
 * here touches the network or native bridge at import time.
 */
export { id, type Dictionary } from './id';
export { en } from './en';
export {
  resolveLanguage,
  localeTagFor,
  fill,
  deviceLanguageTag,
  detectLanguage,
  useLanguage,
  type Language,
} from './locale';
export { dictionaryFor } from './dictionaries';
export { translateSystemCategory } from './categories';
