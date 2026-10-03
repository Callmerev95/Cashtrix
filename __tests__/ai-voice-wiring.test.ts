import {
  AI_VOICE_MAX_TEXT_LENGTH,
  AI_VOICE_MIN_DISPLAY_MS,
  hasVoiceConsent,
  parseAiVoicePayload,
  requestAiVoice,
  setVoiceConsent,
  VOICE_CONSENT_KEY,
} from '@/features/voice/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { aiPrefillEvent } from '@/features/observability/domain';
import { supabase } from '@/supabase';

jest.mock('@/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

const invoke = supabase.functions.invoke as unknown as jest.Mock;

beforeEach(() => {
  invoke.mockReset();
});

describe('parseAiVoicePayload — validasi kawat defensif', () => {
  const valid = {
    ok: true,
    amount: 25000,
    kind: 'expense',
    walletHint: 'GoPay',
    categoryHint: 'Makanan',
    note: 'soto mie 25rb pakai gopay',
    occurred_on: '2026-10-01',
  };

  it('payload valid → prefill tanpa occurred_on', () => {
    expect(parseAiVoicePayload(valid)).toEqual({
      amount: 25000,
      kind: 'expense',
      walletHint: 'GoPay',
      categoryHint: 'Makanan',
      note: 'soto mie 25rb pakai gopay',
    });
  });

  it('{ ok: false } → null', () => {
    expect(parseAiVoicePayload({ ok: false })).toBeNull();
  });

  it.each([[0], [-5], [12.5], ['25000'], [1000000000000]])(
    'amount %s → null',
    (amount) => {
      expect(parseAiVoicePayload({ ...valid, amount })).toBeNull();
    },
  );

  it('kind liar → null', () => {
    expect(parseAiVoicePayload({ ...valid, kind: 'transfer' })).toBeNull();
  });

  it('note kosong → null', () => {
    expect(parseAiVoicePayload({ ...valid, note: '  ' })).toBeNull();
  });

  it('hint kosong → null bukan string kosong', () => {
    expect(
      parseAiVoicePayload({ ...valid, walletHint: ' ', categoryHint: '' }),
    ).toMatchObject({ walletHint: null, categoryHint: null });
  });
});

describe('requestAiVoice — fail-open tanpa throw', () => {
  it('ok:true → ok', async () => {
    invoke.mockResolvedValue({
      data: {
        ok: true,
        amount: 25000,
        kind: 'expense',
        walletHint: 'GoPay',
        categoryHint: 'Makanan',
        note: 'soto',
      },
      error: null,
    });
    await expect(requestAiVoice({ text: 'soto 25rb' })).resolves.toMatchObject({
      status: 'ok',
    });
    expect(invoke).toHaveBeenCalledWith('parse-voice', {
      method: 'POST',
      body: { text: 'soto 25rb' },
    });
  });

  it('teks kosong → empty tanpa network', async () => {
    await expect(requestAiVoice({ text: '  ' })).resolves.toEqual({
      status: 'empty',
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('429 → rate_limited, 402 → quota_exceeded', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { context: { status: 429 } },
    });
    await expect(requestAiVoice({ text: 'x' })).resolves.toEqual({
      status: 'rate_limited',
    });
    invoke.mockResolvedValue({
      data: null,
      error: { context: { status: 402 } },
    });
    await expect(requestAiVoice({ text: 'x' })).resolves.toEqual({
      status: 'quota_exceeded',
    });
  });

  it('throw transport → offline', async () => {
    invoke.mockRejectedValue(new Error('down'));
    await expect(requestAiVoice({ text: 'x' })).resolves.toEqual({
      status: 'offline',
    });
  });

  it('bentuk asing → empty', async () => {
    invoke.mockResolvedValue({ data: { ok: false }, error: null });
    await expect(requestAiVoice({ text: 'x' })).resolves.toEqual({
      status: 'empty',
    });
  });
});

describe('AI4 honesty floor + KPI boolean-only', () => {
  it('MIN_DISPLAY 900ms sama scan', () => {
    expect(AI_VOICE_MIN_DISPLAY_MS).toBe(900);
  });

  it('teks dipotong 500 char', () => {
    expect(AI_VOICE_MAX_TEXT_LENGTH).toBe(500);
  });

  it('ai_prefill_ok boolean saja, tanpa nominal', () => {
    expect(aiPrefillEvent({ ok: true })).toEqual({
      name: 'ai_prefill_ok',
      params: { ok: true },
    });
    expect(aiPrefillEvent({ ok: false })).toEqual({
      name: 'ai_prefill_ok',
      params: { ok: false },
    });
  });
});

describe('consent-once voice (AI5: kunci terpisah dari scan)', () => {
  beforeEach(async () => {
    await AsyncStorage.removeItem(VOICE_CONSENT_KEY);
  });

  it('kunci voice berbeda dari kunci scan', () => {
    expect(VOICE_CONSENT_KEY).toBe('cashtrix:voice-consent-v1');
    expect(VOICE_CONSENT_KEY).not.toBe('cashtrix:scan-consent-v1');
  });

  it('baru → belum setuju (tanya sekali)', async () => {
    await expect(hasVoiceConsent()).resolves.toBe(false);
  });

  it('setuju → menetap', async () => {
    await setVoiceConsent();
    await expect(hasVoiceConsent()).resolves.toBe(true);
    expect(await AsyncStorage.getItem(VOICE_CONSENT_KEY)).toBe('1');
  });
});
