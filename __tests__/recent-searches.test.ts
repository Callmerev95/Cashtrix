/**
 * Recent search queries (backlog §6.10) — the pure seam plus the storage
 * roundtrip. The screen only records on a deliberate submit or chip tap, so
 * these rules are what keep the chips trustworthy (newest first, capped,
 * case-insensitive dedupe, corrupt pref degrades to empty).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  RECENT_SEARCH_CAP,
  RECENT_SEARCHES_KEY,
  addRecentSearch,
  loadRecentSearches,
  parseRecentSearches,
  removeRecentSearch,
  saveRecentSearches,
} from '@/features/transactions';

describe('recent search list (backlog §6.10)', () => {
  it('trims and collapses whitespace before storing', () => {
    expect(addRecentSearch([], '  kopi   susu  ')).toEqual(['kopi susu']);
  });

  it('moves a repeated query back to the front, case-insensitively', () => {
    expect(addRecentSearch(['nasi goreng', 'kopi'], 'Kopi')).toEqual([
      'Kopi',
      'nasi goreng',
    ]);
  });

  it('caps the list at RECENT_SEARCH_CAP', () => {
    let list: string[] = [];
    for (let i = 0; i < RECENT_SEARCH_CAP + 3; i += 1) {
      list = addRecentSearch(list, `query ${i}`);
    }
    expect(list).toHaveLength(RECENT_SEARCH_CAP);
    expect(list[0]).toBe(`query ${RECENT_SEARCH_CAP + 2}`);
  });

  it('ignores blank submissions', () => {
    expect(addRecentSearch(['kopi'], '   ')).toEqual(['kopi']);
  });

  it('removes a query case-insensitively (the per-chip X)', () => {
    expect(removeRecentSearch(['Kopi', 'nasi'], 'kopi')).toEqual(['nasi']);
  });
});

describe('parseRecentSearches', () => {
  it('reads a well-formed list', () => {
    expect(parseRecentSearches('["kopi","nasi"]')).toEqual(['kopi', 'nasi']);
  });

  it('degrades to an empty list on anything unreadable', () => {
    expect(parseRecentSearches(null)).toEqual([]);
    expect(parseRecentSearches('not json')).toEqual([]);
    expect(parseRecentSearches('{"a":1}')).toEqual([]);
  });

  it('drops non-strings, blanks and duplicates, then applies the cap', () => {
    const raw = JSON.stringify([3, 'kopi', '', '  ', 'KOPI', 'nasi']);
    expect(parseRecentSearches(raw)).toEqual(['kopi', 'nasi']);
  });
});

describe('storage roundtrip', () => {
  beforeEach(async () => {
    await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  });

  it('saves and loads through AsyncStorage', async () => {
    await saveRecentSearches(['kopi', 'nasi']);
    expect(await loadRecentSearches()).toEqual(['kopi', 'nasi']);
  });

  it('returns an empty list when the pref is absent', async () => {
    expect(await loadRecentSearches()).toEqual([]);
  });
});
