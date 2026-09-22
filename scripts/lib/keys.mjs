/**
 * Shared key reader for the live `verify-*.mjs` scripts (and
 * `provision-e2e.mjs`).
 *
 * CI has no `.env` (gitignored) but provides the publishable key as the
 * `EXPO_PUBLIC_SUPABASE_ANON_KEY` secret; local runs have `.env` instead.
 * Prefer the environment (explicit beats ambient), fall back to the repo
 * root `.env`, and throw a clear error when neither exists — a raw ENOENT
 * from `readFileSync` is what used to fail the release-gate `live` job.
 *
 * Run from the repo root so the `.env` fallback resolves normally.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function readAnonKey() {
  const fromEnv = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  if (fromEnv) return fromEnv;

  const dotEnv = join(process.cwd(), '.env');
  if (existsSync(dotEnv)) {
    const fromFile = /EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)/.exec(
      readFileSync(dotEnv, 'utf8'),
    )?.[1]?.trim();
    if (fromFile) return fromFile;
  }

  throw new Error(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY tidak ditemukan (isi .env atau env)',
  );
}
