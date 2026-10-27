/**
 * OB3 done notice: only a clean full pass earns the short “sent” strip, and
 * it clears on the OB3 timer instead of lingering as a fake queue state.
 */
import { act, renderHook } from '@testing-library/react-native';

import { OUTBOX_DONE_MS } from '@/features/outbox';
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
  onLocalDataPurge: () => () => {},
}));

jest.mock('@/features/outbox/files', () => ({
  sweepOrphanOutboxPhotos: () => 0,
}));

jest.mock('@/features/outbox/flush', () => ({
  flushOutbox: jest.fn(),
}));

const flushApi = require('@/features/outbox/flush') as {
  flushOutbox: jest.Mock;
};

beforeEach(() => {
  jest.useFakeTimers();
  setOutboxDatabaseForTests(createMemoryOutboxDb());
  flushApi.flushOutbox.mockReset();
});

afterEach(() => {
  resetOutboxDatabaseForTests();
  jest.useRealTimers();
});

async function mounted() {
  const hook = renderHook(() => useOutbox(), { wrapper: OutboxProvider });
  await act(async () => {
    await hook.result.current.refreshPending();
  });
  return hook;
}

describe('OutboxProvider done notice', () => {
  it('publishes a clean pass and clears it after OUTBOX_DONE_MS', async () => {
    flushApi.flushOutbox.mockResolvedValue({
      sent: 2,
      failed: 0,
      stopped: false,
    });
    const { result } = await mounted();

    await act(async () => {
      await result.current.flush();
    });

    expect(result.current.flushing).toBe(false);
    expect(result.current.lastFlush).toMatchObject({
      sent: 2,
      failed: 0,
      stopped: false,
    });

    act(() => {
      jest.advanceTimersByTime(OUTBOX_DONE_MS);
    });
    expect(result.current.lastFlush).toBeNull();
  });

  it('clears a previous clean notice when a new pass starts', async () => {
    flushApi.flushOutbox.mockResolvedValueOnce({
      sent: 1,
      failed: 0,
      stopped: false,
    });
    const { result } = await mounted();

    await act(async () => {
      await result.current.flush();
    });
    expect(result.current.lastFlush).not.toBeNull();

    flushApi.flushOutbox.mockResolvedValueOnce({
      sent: 0,
      failed: 0,
      stopped: false,
    });
    await act(async () => {
      await result.current.flush();
    });
    expect(result.current.lastFlush).toBeNull();
  });

  it('never calls a pass with a refusal or a stop a clean pass', async () => {
    const { result } = await mounted();

    flushApi.flushOutbox.mockResolvedValueOnce({
      sent: 1,
      failed: 1,
      stopped: false,
    });
    await act(async () => {
      await result.current.flush();
    });
    expect(result.current.lastFlush).toBeNull();

    flushApi.flushOutbox.mockResolvedValueOnce({
      sent: 1,
      failed: 1,
      stopped: true,
    });
    await act(async () => {
      await result.current.flush();
    });
    expect(result.current.lastFlush).toBeNull();
  });
});
