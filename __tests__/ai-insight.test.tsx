/**
 * Insight AI (L1, Analytics Overhaul).
 *
 * Server seam (`supabase/functions/insight-summary/`): prompt carries the
 * deterministic lines + lang; the validator enforces the SAME line count
 * and EVERY figure verbatim (figure-preservation gate) — a number-inventing
 * reply is rejected whole and the client falls back to deterministic.
 * Recorded `modelJson` replays run through the REAL validator (AI2 split
 * pattern: voice parser pinned by prompt+replay, receipt parser pure).
 *
 * Client (`src/features/analytics/insight.ts`): defensive payload parse +
 * fail-open outcomes (only rate/quota distinct) + consent key. The wiring
 * test pins the KPI boolean-only rule (`insight_ai_ok`, PRD §4.4).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  buildInsightPrompt,
  INSIGHT_MAX_INPUT_LINES,
} from '../supabase/functions/insight-summary/prompt';
import {
  extractFigures,
  parseModelJson,
  validateInsightPayload,
} from '../supabase/functions/insight-summary/validate';
import {
  INSIGHT_CONSENT_KEY,
  INSIGHT_REQUEST_TIMEOUT_MS,
  parseInsightPayload,
  requestInsight,
  shouldAutoRefine,
} from '@/features/analytics/insight';
import {
  getCachedInsightAi,
  resetInsightAiCacheForTests,
  setCachedInsightAi,
} from '@/features/analytics/insight-cache';
import {
  getInsightConsentSnapshot,
  setInsightConsented,
  subscribeInsightConsent,
} from '@/features/analytics/insight-consent';
import { InsightCard } from '@/features/analytics/components/insight-card';
import { fetchOverview } from '@/features/analytics/api';
import { resolveRange } from '@/features/analytics/domain';
import { insightAiEvent } from '@/features/observability';
import { supabase } from '@/supabase';

jest.mock('@/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    rpc: jest.fn(),
  },
}));

const invoke = supabase.functions.invoke as unknown as jest.Mock;
const rpc = (supabase as unknown as { rpc: jest.Mock }).rpc;

beforeEach(() => {
  invoke.mockReset();
});

const INPUT_ID = [
  'Pengeluaran Oktober naik 12,5% vs September.',
  'Makanan mendominasi: 55% dari pengeluaran.',
  'Pemasukan menutup pengeluaran, sisa Rp 250.000.',
];

const REPLAY_ID = {
  lines: [
    'Pengeluaran Oktobermu naik 12,5% dibanding September.',
    'Makanan jadi yang terbesar: 55% dari pengeluaran.',
    'Kabar baik — pemasukan menutup pengeluaran, sisa Rp 250.000.',
  ],
};

describe('prompt seam', () => {
  it('membawa baris + bahasa, tanpa janji baru', () => {
    const prompt = buildInsightPrompt({ lines: INPUT_ID, lang: 'id' });
    expect(prompt).toContain('Indonesian');
    for (const line of INPUT_ID) expect(prompt).toContain(line);
    const promptEn = buildInsightPrompt({ lines: INPUT_ID, lang: 'en' });
    expect(promptEn).toContain('English');
    expect(INSIGHT_MAX_INPUT_LINES).toBe(4);
  });
});

describe('validator seam (figure-preservation gate)', () => {
  it('replay valid lolos utuh dengan angka utuh', () => {
    const out = validateInsightPayload(
      parseModelJson(JSON.stringify(REPLAY_ID)),
      INPUT_ID,
    );
    expect(out).toEqual(REPLAY_ID.lines);
  });

  it.each([
    ['angka hilang', { lines: ['Naik dibanding September.', REPLAY_ID.lines[1], REPLAY_ID.lines[2]] }],
    ['angka berubah', { lines: [REPLAY_ID.lines[0]?.replace('12,5%', '10%') ?? '', REPLAY_ID.lines[1], REPLAY_ID.lines[2]] }],
    ['jumlah baris beda', { lines: REPLAY_ID.lines.slice(0, 2) }],
    ['baris kosong', { lines: ['', REPLAY_ID.lines[1], REPLAY_ID.lines[2]] }],
    ['bukan JSON', null],
    ['bukan objek', []],
  ])('menolak utuh: %s', (_label, payload) => {
    const data = payload === null ? parseModelJson('bukan json {{{') : payload;
    expect(validateInsightPayload(data, INPUT_ID)).toBeNull();
  });

  it('mengekstrak token angka (nominal, persen, tahun)', () => {
    expect(extractFigures(INPUT_ID)).toEqual(
      expect.arrayContaining(['12,5%', '55%', '250.000']),
    );
    expect(extractFigures(['Bulan pertama yang tercatat.'])).toEqual([]);
  });
});

describe('client insight.ts', () => {
  it('consent key device-local versi insight (bukan voice/scan)', () => {
    expect(INSIGHT_CONSENT_KEY).toBe('cashtrix:insight-consent-v1');
  });

  it('parse defensif: ok shape lolos, sisanya null', () => {
    expect(parseInsightPayload({ ok: true, lines: ['a', 'b'] })).toEqual([
      'a',
      'b',
    ]);
    expect(parseInsightPayload({ ok: false })).toBeNull();
    expect(parseInsightPayload({ ok: true, lines: [] })).toBeNull();
    expect(
      parseInsightPayload({ ok: true, lines: ['a', 'b', 'c', 'd', 'e'] }),
    ).toBeNull();
    expect(parseInsightPayload({ ok: true, lines: ['  '] })).toBeNull();
  });

  it('outcome: ok / empty / offline-throw / 429 / 402', async () => {
    invoke.mockResolvedValue({ data: { ok: true, lines: ['x'] }, error: null });
    await expect(
      requestInsight({ lines: ['a'], lang: 'id' }),
    ).resolves.toEqual({ status: 'ok', lines: ['x'] });

    invoke.mockResolvedValue({ data: { ok: false }, error: null });
    await expect(
      requestInsight({ lines: ['a'], lang: 'id' }),
    ).resolves.toEqual({ status: 'empty' });

    await expect(
      requestInsight({ lines: ['   '], lang: 'id' }),
    ).resolves.toEqual({ status: 'empty' });

    invoke.mockRejectedValue(new Error('jaringan mati'));
    await expect(
      requestInsight({ lines: ['a'], lang: 'id' }),
    ).resolves.toEqual({ status: 'offline' });

    invoke.mockResolvedValue({
      data: null,
      error: { context: { status: 429 } },
    });
    await expect(
      requestInsight({ lines: ['a'], lang: 'id' }),
    ).resolves.toEqual({ status: 'rate_limited' });

    invoke.mockResolvedValue({
      data: null,
      error: { context: { status: 402 } },
    });
    await expect(
      requestInsight({ lines: ['a'], lang: 'id' }),
    ).resolves.toEqual({ status: 'quota_exceeded' });

    invoke.mockResolvedValue({
      data: null,
      error: { context: { status: 500 } },
    });
    await expect(
      requestInsight({ lines: ['a'], lang: 'id' }),
    ).resolves.toEqual({ status: 'offline' });
  });

  it('invoke gantung = offline setelah timeout (fix sunyi-abadi)', async () => {
    jest.useFakeTimers();
    try {
      invoke.mockImplementation(() => new Promise(() => undefined));
      const pending = requestInsight({ lines: ['a'], lang: 'id' });
      await jest.advanceTimersByTimeAsync(INSIGHT_REQUEST_TIMEOUT_MS);
      await expect(pending).resolves.toEqual({ status: 'offline' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('insight_ai_ok boolean saja, tanpa baris/angka', () => {
    expect(insightAiEvent({ ok: true })).toEqual({
      name: 'insight_ai_ok',
      params: { ok: true },
    });
    expect(insightAiEvent({ ok: false }).params).toEqual({ ok: false });
  });

  it('body request hanya lines + lang (tanpa konteks mentah)', async () => {
    invoke.mockResolvedValue({ data: { ok: true, lines: ['x'] }, error: null });
    await requestInsight({ lines: ['a', 'b'], lang: 'en' });
    expect(invoke).toHaveBeenCalledWith(
      'insight-summary',
      expect.objectContaining({
        body: { lines: ['a', 'b'], lang: 'en' },
      }),
    );
  });
});

describe('InsightCard L1', () => {  const summary = { title: 'Ringkasan', lines: ['Baris satu.', 'Baris dua.'] };
  const labels = {
    refineLabel: 'Susun ulang',
    refiningLabel: 'Menyusun…',
    aiBadge: 'Asisten AI',
    rateLimitedNote: 'Terlalu sering.',
    quotaNote: 'Kuota habis.',
    retryLabel: 'Coba lagi',
  };

  it('idle: deterministik + tombol refine; tap refine memanggil onRefine', () => {
    const onRefine = jest.fn();
    render(
      <InsightCard
        summary={summary}
        aiLines={null}
        aiState="idle"
        onRefine={onRefine}
        onRetry={jest.fn()}
        {...labels}
      />,
    );
    expect(screen.getByText('Baris satu.')).toBeTruthy();
    expect(screen.queryByTestId('analytics-insight-ai-badge')).toBeNull();
    fireEvent.press(screen.getByTestId('analytics-insight-refine'));
    expect(onRefine).toHaveBeenCalledTimes(1);
  });

  it('ai: baris model + badge; loading/rate/quota tampil jujur', () => {
    const onRetry = jest.fn();
    const { rerender } = render(
      <InsightCard
        summary={summary}
        aiLines={['Model satu.']}
        aiState="ai"
        onRefine={jest.fn()}
        onRetry={onRetry}
        {...labels}
      />,
    );
    expect(screen.getByText('Model satu.')).toBeTruthy();
    expect(screen.getByTestId('analytics-insight-ai-badge')).toBeTruthy();
    expect(screen.queryByTestId('analytics-insight-refine')).toBeNull();

    rerender(
      <InsightCard
        summary={summary}
        aiLines={null}
        aiState="loading"
        onRefine={jest.fn()}
        onRetry={onRetry}
        {...labels}
      />,
    );
    expect(screen.getByTestId('analytics-insight-loading')).toBeTruthy();
    expect(screen.getByText('Baris satu.')).toBeTruthy();

    rerender(
      <InsightCard
        summary={summary}
        aiLines={null}
        aiState="rate_limited"
        onRefine={jest.fn()}
        onRetry={onRetry}
        {...labels}
      />,
    );
    fireEvent.press(screen.getByTestId('analytics-insight-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(
      <InsightCard
        summary={summary}
        aiLines={null}
        aiState="quota_exceeded"
        onRefine={jest.fn()}
        onRetry={onRetry}
        {...labels}
      />,
    );
    expect(screen.getByTestId('analytics-insight-quota')).toBeTruthy();
  });
});

describe('insight consent store (L1 auto)', () => {
  beforeEach(async () => {
    await setInsightConsented(false);
  });

  it('awal mati; setuju menyala + persist; revoke mematikan + menghapus', async () => {
    expect(getInsightConsentSnapshot()).toBe(false);
    const notified: boolean[] = [];
    const stop = subscribeInsightConsent(() =>
      notified.push(getInsightConsentSnapshot()),
    );
    await setInsightConsented(true);
    expect(getInsightConsentSnapshot()).toBe(true);
    const AsyncStorage =
      jest.requireMock('@react-native-async-storage/async-storage').default;
    await expect(AsyncStorage.getItem(INSIGHT_CONSENT_KEY)).resolves.toBe(
      '1',
    );
    await setInsightConsented(false);
    expect(getInsightConsentSnapshot()).toBe(false);
    await expect(AsyncStorage.getItem(INSIGHT_CONSENT_KEY)).resolves.toBeNull();
    expect(notified).toEqual([true, false]);
    stop();
  });
});

describe('insight session cache (L1 auto)', () => {
  beforeEach(() => {
    resetInsightAiCacheForTests();
  });

  it('hit per kunci; kunci asing null', () => {
    expect(getCachedInsightAi('k1')).toBeNull();
    setCachedInsightAi('k1', ['x']);
    expect(getCachedInsightAi('k1')).toEqual(['x']);
    expect(getCachedInsightAi('k2')).toBeNull();
  });

  it('cap 10: kunci tertua terbuang, tulis-ulang menyegarkan recency', () => {
    for (let i = 0; i < 10; i += 1) setCachedInsightAi(`k${i}`, [`v${i}`]);
    setCachedInsightAi('k0', ['v0-baru']);
    setCachedInsightAi('k10', ['v10']);
    expect(getCachedInsightAi('k1')).toBeNull();
    expect(getCachedInsightAi('k0')).toEqual(['v0-baru']);
    expect(getCachedInsightAi('k10')).toEqual(['v10']);
  });
});

describe('shouldAutoRefine (L1 auto gate)', () => {
  it.each([
    ['consent + idle + ada baris', true, 'idle', true, true],
    ['belum consent', false, 'idle', true, false],
    ['sedang loading', true, 'loading', true, false],
    ['sudah ai', true, 'ai', true, false],
    ['rate limited', true, 'rate_limited', true, false],
    ['tanpa baris', true, 'idle', false, false],
  ])('%s', (_label, consented, aiState, hasLines, expected) => {
    expect(
      shouldAutoRefine({
        consented: consented as boolean,
        aiState: aiState as string,
        hasLines: hasLines as boolean,
      }),
    ).toBe(expected as boolean);
  });
});

describe('L2 wiring (prev_breakdown + budget 4 baris)', () => {
  const row = {
    category_id: 'c1',
    category_name: 'Makanan',
    category_icon: 'restaurant',
    total_expense: 200000,
    transaction_count: 2,
    share: 1,
  };
  const basePayload = {
    range: { start: 'x', end: 'y' },
    totals: { expense: 1, income: 2, net: 1 },
    previous: { expense: 1, income: 2, net: 1 },
    delta: { expense: null, income: null, net: null },
    breakdown: [],
    series: [],
  };
  const overviewInput = {
    range: resolveRange('1M'),
    tz: 'Asia/Jakarta',
    walletId: null,
    daily: true,
  };

  it('fetchOverview memetakan prev_breakdown; absen = [] (mode L1)', async () => {
    rpc.mockResolvedValue({
      data: { ...basePayload, prev_breakdown: [row] },
      error: null,
    });
    const withPrev = await fetchOverview(overviewInput);
    expect(withPrev.prevBreakdown).toEqual([
      {
        categoryId: 'c1',
        categoryName: 'Makanan',
        categoryIcon: 'restaurant',
        totalExpense: 200000,
        transactionCount: 2,
        share: 1,
      },
    ]);

    rpc.mockResolvedValue({ data: { ...basePayload }, error: null });
    const withoutPrev = await fetchOverview(overviewInput);
    expect(withoutPrev.prevBreakdown).toEqual([]);
    expect(rpc).toHaveBeenCalledWith(
      'analytics_overview',
      expect.objectContaining({ wallet_filter: null }),
    );
  });

  it('validator + klien menerima 4 baris, menolak 5', () => {
    const four = ['satu 10%.', 'dua Rp 1.000.', 'tiga 2026.', 'empat 5%.'];
    expect(validateInsightPayload({ lines: four }, four)).toEqual(four);
    expect(
      validateInsightPayload({ lines: [...four, 'lima.'] }, [...four, 'lima.']),
    ).toBeNull();
    expect(parseInsightPayload({ ok: true, lines: four })).toEqual(four);
    expect(parseInsightPayload({ ok: true, lines: [...four, 'lima.'] })).toBeNull();
  });
});
