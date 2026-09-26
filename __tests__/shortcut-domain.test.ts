/**
 * Shortcut deep-link params (S1, ADR-0009) — the pure Jest seam.
 *
 * Locks: only `expense`/`income` preselect the form segment (`transfer`
 * and anything unknown fall through to the remembered preference), and
 * only the exact `scan=1` the `/scan` alias emits arms scan mode.
 */
import {
  parseScanFlag,
  parseShortcutType,
  scanForcedType,
} from '@/features/transactions';

describe('parseShortcutType (S1)', () => {
  it.each([['expense'], ['income']])('accepts %p', (value) => {
    expect(parseShortcutType(value)).toBe(value);
  });

  it.each([['transfer'], ['EXPENSE'], [''], [null], [undefined], [(123 as unknown)], [('expense ' as unknown)]])(
    'rejects %p (falls back to the remembered preference)',
    (value) => {
      expect(parseShortcutType(value)).toBeNull();
    },
  );
});

describe('parseScanFlag (S1)', () => {
  it('arms scan mode only for the exact scan=1 the alias emits', () => {
    expect(parseScanFlag('1')).toBe(true);
  });

  it.each([['0'], ['true'], [''], [null], [undefined]])(
    'ignores %p',
    (value) => {
      expect(parseScanFlag(value)).toBe(false);
    },
  );
});

describe('scanForcedType (S3: scan = expense-only)', () => {
  it('scan mode forces expense (struk = belanja)', () => {
    expect(scanForcedType(true)).toBe('expense');
  });

  it('off → null (the usual override chain applies)', () => {
    expect(scanForcedType(false)).toBeNull();
  });
});
