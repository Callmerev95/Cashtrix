/**
 * Sentry transport tests (V1, issue #30) — the AC "event tanpa amount/note".
 *
 * What is pinned here is the ticket's load-bearing guarantee carried over
 * from T10 (PRD §4.4): even through the Sentry path, no financial data
 * (`amount`/`note`/spent/limits) may leave the device. The transport is
 * exercised with a recording fake, so no native module is involved; one
 * test also proves `initSentry` stays a no-op without a DSN (the daily
 * Expo Go default) and wires the SDK when one is present.
 */
import {
  containsFinancialData,
  screenViewEvent,
} from '@/features/observability/domain';
import {
  bufferedEvents,
  resetObservabilityForTests,
  trackEvent,
} from '@/features/observability/observability';
import {
  createSentryTransport,
  initSentry,
  type SentryClient,
} from '@/features/observability/sentry';
import type { Breadcrumb } from '@sentry/react-native';
import type { AnalyticsEvent } from '@/features/observability/domain';

function makeFakeClient() {
  const breadcrumbs: Breadcrumb[] = [];
  const exceptions: { error: unknown; hint: unknown }[] = [];
  const client: SentryClient = {
    addBreadcrumb: (crumb) => {
      breadcrumbs.push(crumb);
    },
    captureException: (error, hint) => {
      exceptions.push({ error, hint });
      return 'fake-event-id';
    },
  };
  return { breadcrumbs, exceptions, client };
}

beforeEach(() => {
  resetObservabilityForTests();
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
});

afterEach(() => {
  resetObservabilityForTests();
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
});

describe('createSentryTransport — scrubbed before anything reaches Sentry', () => {
  it('forwards analytics as breadcrumbs with amount/note redacted', () => {
    const { breadcrumbs, client } = makeFakeClient();
    const transport = createSentryTransport(client);

    // A hand-built event that bypassed the domain builders — the transport
    // is the defensive backstop, so it must scrub, not trust.
    const dirty = {
      name: 'tx_created',
      params: {
        type: 'expense',
        has_note: true,
        amount: 250000,
        note: 'Kopi pagi',
        nested: { spent: 90000 },
      },
    } as unknown as AnalyticsEvent;
    transport.track(dirty);

    expect(breadcrumbs).toHaveLength(1);
    const crumb = breadcrumbs[0] as {
      category: string;
      message: string;
      data: Record<string, unknown>;
    };
    expect(crumb.category).toBe('analytics');
    expect(crumb.message).toBe('tx_created');
    expect(crumb.data.type).toBe('expense');
    expect(crumb.data.has_note).toBe(true);
    // `containsFinancialData` detects financial *keys* (still present as
    // `[redacted]` by design) — the AC is about raw *values*, so assert the
    // raw figures and note text appear nowhere in the forwarded payload.
    expect(crumb.data.amount).toBe('[redacted]');
    expect(crumb.data.note).toBe('[redacted]');
    const serialised = JSON.stringify(crumb.data);
    expect(serialised).not.toContain('250000');
    expect(serialised).not.toContain('Kopi pagi');
    expect(serialised).not.toContain('90000');
  });

  it('scrubs error context the same way, keeping the error itself', () => {
    const { exceptions, client } = makeFakeClient();
    const transport = createSentryTransport(client);

    const error = new Error('wallet refresh failed');
    transport.capture(error, {
      walletId: 'w-1',
      amount: 100000,
      note: 'rahasia',
    });

    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]?.error).toBe(error);
    const extra = (exceptions[0]?.hint as { extra: unknown }).extra;
    expect(extra).toMatchObject({
      walletId: 'w-1',
      amount: '[redacted]',
      note: '[redacted]',
    });
    const serialised = JSON.stringify(extra);
    expect(serialised).not.toContain('100000');
    expect(serialised).not.toContain('rahasia');
  });

  it('carries only clean contracted events without redaction marks', () => {
    const { breadcrumbs, client } = makeFakeClient();
    const transport = createSentryTransport(client);

    transport.track(screenViewEvent('analytics'));

    const crumb = breadcrumbs[0] as { data: Record<string, unknown> };
    expect(containsFinancialData(crumb.data)).toBe(false);
    expect(crumb.data).toEqual({ screen: 'analytics' });
  });
});

describe('initSentry — DSN-gated, never throws', () => {
  it('is a no-op without a DSN, leaving the redacted buffer in place', () => {
    expect(initSentry()).toBe(false);

    trackEvent(screenViewEvent('budgets'));
    expect(bufferedEvents()).toHaveLength(1);
    expect(bufferedEvents()[0]).toEqual({
      name: 'screen_view',
      params: { screen: 'budgets' },
    });
  });

  it('initialises the SDK and swaps the transport when a DSN is set', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://test@localhost/1';
    const Sentry = require('@sentry/react-native') as {
      init: jest.Mock;
      addBreadcrumb: jest.Mock;
    };

    expect(initSentry()).toBe(true);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://test@localhost/1' }),
    );

    // Events now flow to Sentry (mocked), not the local buffer.
    trackEvent(screenViewEvent('profile'));
    expect(bufferedEvents()).toHaveLength(0);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'screen_view' }),
    );
  });
});
