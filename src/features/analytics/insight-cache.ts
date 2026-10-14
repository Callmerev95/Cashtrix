/**
 * Session AI cache (L1 auto, Analytics Overhaul).
 *
 * Auto-rephrase is per-NUMBERS-changed, not per-open: the same summary
 * key never costs a second model call within the session. Map insertion
 * order = recency (set refreshes), capped so a long session cannot grow
 * it without bound. Quota math: opens are free, distinct data states cost
 * one call each — the cheapest auto that still feels like "default LLM".
 */

const INSIGHT_AI_CACHE_CAP = 10;

const cache = new Map<string, string[]>();

export function getCachedInsightAi(key: string): string[] | null {
  return cache.get(key) ?? null;
}

export function setCachedInsightAi(key: string, lines: string[]): void {
  cache.delete(key);
  cache.set(key, lines);
  while (cache.size > INSIGHT_AI_CACHE_CAP) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

/** Test-only reset (module state outlives a single test). */
export function resetInsightAiCacheForTests(): void {
  cache.clear();
}
