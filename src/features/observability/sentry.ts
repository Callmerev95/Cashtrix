/**
 * Sentry transport (V1, issue #30) — the native crash sink behind the
 * `configureTransport` seam from T10.
 *
 * Contract (spec v1.1 §V1, PRD §4.4):
 *  - every outbound payload passes through `scrubValue` here too, so
 *    `amount`/`note` (and friends) can never reach Sentry — even for a
 *    hand-built event that bypassed the domain builders;
 *  - analytics events travel as Sentry *breadcrumbs* (attached to the next
 *    crash report), not as standalone Sentry events, so they cost no quota;
 *  - `initSentry` is a no-op without `EXPO_PUBLIC_SENTRY_DSN`: daily JS work
 *    in Expo Go keeps the redacted in-memory buffer from T10, and only
 *    dev-client builds with a DSN (EAS secret / `.env`) report anywhere;
 *  - nothing here ever throws — reporting must not break the code path
 *    being reported on.
 */
import * as Sentry from '@sentry/react-native';

import { scrubValue, type AnalyticsEvent } from './domain';
import {
  configureTransport,
  type ObservabilityTransport,
} from './observability';

/**
 * Minimal surface of the Sentry SDK this transport touches. Typed from the
 * real SDK, so `Sentry` itself always satisfies it; tests inject a recording
 * fake with the same shape and never load the native module.
 */
export type SentryClient = Pick<
  typeof Sentry,
  'addBreadcrumb' | 'captureException'
>;

/**
 * Builds a Sentry-backed transport over any `SentryClient`-shaped object.
 * The real SDK is passed in production; tests inject a recording fake.
 */
export function createSentryTransport(
  client: SentryClient,
): ObservabilityTransport {
  return {
    track: (event: AnalyticsEvent) => {
      const scrubbed = scrubValue(event) as AnalyticsEvent;
      client.addBreadcrumb({
        category: 'analytics',
        message: scrubbed.name,
        data: scrubbed.params,
        level: 'info',
      });
    },
    capture: (error: unknown, context: Record<string, unknown>) => {
      const scrubbed = scrubValue(context) as Record<string, unknown>;
      const err =
        error instanceof Error
          ? error
          : new Error(
              typeof error === 'string' ? error : 'Unknown error',
            );
      client.captureException(err, { extra: scrubbed });
    },
  };
}

/**
 * Initialises the Sentry SDK and swaps the observability sink to it.
 * Returns `true` when reporting is live, `false` when the app keeps the
 * local buffer (no DSN — the Expo Go default). Never throws.
 */
export function initSentry(): boolean {
  try {
    const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
    if (!dsn) return false;
    Sentry.init({
      dsn,
      // Belt and suspenders: `trackEvent`/`captureError` already scrub, but
      // auto-captured native crashes and breadcrumbs bypass them.
      beforeSend: (event) => scrubValue(event) as typeof event,
      beforeBreadcrumb: (crumb) => scrubValue(crumb) as typeof crumb,
    });
    configureTransport(createSentryTransport(Sentry));
    return true;
  } catch {
    return false;
  }
}
