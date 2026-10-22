/**
 * Recent search queries (backlog §6.10) — device-local only. The key is
 * registered in `LOCAL_STORAGE_KEYS`, so sign-out purges the list with the
 * other prefs. Reads/writes are best-effort: a failing pref never blocks
 * searching.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseRecentSearches } from './domain';

export const RECENT_SEARCHES_KEY = 'cashtrix:recent-searches';

export async function loadRecentSearches(): Promise<string[]> {
  try {
    return parseRecentSearches(await AsyncStorage.getItem(RECENT_SEARCHES_KEY));
  } catch {
    return [];
  }
}

export async function saveRecentSearches(list: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
  } catch {
    // Best-effort pref; stale chips next open beat a crash now.
  }
}
