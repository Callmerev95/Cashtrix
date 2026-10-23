/**
 * Sign-out purge (OB1 gate): the OutboxProvider listens to the single Supabase
 * purge hook and must empty both the queue and the read cache.
 */
import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { countOutbox, enqueueOutbox, readCache, writeCache } from '@/features/outbox';
import {
  OutboxProvider,
  useOutbox,
} from '@/features/outbox/outbox-context';
import {
  resetOutboxDatabaseForTests,
  setOutboxDatabaseForTests,
} from '@/features/outbox/db';
import { createMemoryOutboxDb } from './helpers/outbox-db';

jest.mock('@/features/auth', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));

jest.mock('@/supabase', () => ({
  onLocalDataPurge: (listener: () => void) => {
    const store = globalThis as { __outboxPurge?: (() => void)[] };
    store.__outboxPurge = [...(store.__outboxPurge ?? []), listener];
    return () => {};
  },
}));

jest.mock('@/features/outbox/files', () => ({
  sweepOrphanOutboxPhotos: () => 0,
}));

const USER = 'user-1';

function Probe() {
  const { pendingCount, available } = useOutbox();
  return (
    <Text testID="pending-count">{`${pendingCount}/${available}`}</Text>
  );
}

beforeEach(() => {
  setOutboxDatabaseForTests(createMemoryOutboxDb());
  (globalThis as { __outboxPurge?: (() => void)[] }).__outboxPurge = [];
});

afterEach(() => {
  resetOutboxDatabaseForTests();
});

describe('OutboxProvider sign-out purge', () => {
  it('empties the queue and the read cache', async () => {
    await enqueueOutbox({
      userId: USER,
      walletId: 'wallet-1',
      categoryId: 'cat-1',
      counterpartyWalletId: null,
      type: 'expense',
      amount: 25_000,
      occurredAt: '2026-10-22T03:00:00.000Z',
      note: 'kopi',
      idempotencyKey: 'key-1',
      receiptIds: [],
      receiptPaths: [],
      display: {
        type: 'expense',
        amount: 25_000,
        note: 'kopi',
        occurredAt: '2026-10-22T03:00:00.000Z',
        walletName: 'BCA',
        categoryName: 'Makanan',
        categoryIcon: 'restaurant',
        counterpartyWalletName: null,
      },
    });
    await writeCache(USER, 'feed', [{ id: 'tx-1' }]);

    const screen = render(
      <OutboxProvider>
        <Probe />
      </OutboxProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('pending-count')).toHaveTextContent('1/true');
    });

    const listeners =
      (globalThis as { __outboxPurge?: (() => void)[] }).__outboxPurge ?? [];
    await act(async () => {
      for (const listener of listeners) listener();
    });

    expect(screen.getByTestId('pending-count')).toHaveTextContent('0/true');
    await waitFor(async () => {
      expect(await countOutbox(USER)).toBe(0);
      expect(await readCache(USER, 'feed')).toBeNull();
    });
  });
});
