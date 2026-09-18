/**
 * Observability sink (T10, issue #11) — crash + event reporting with
 * financial-data scrubbing.
 *
 * Contract (PRD §4.3–§4.4):
 *  - every outbound event/error context passes through `scrubValue`, so
 *    `amount`/`note` (and friends) can never leak into a log or report;
 *  - nothing here ever throws — analytics must not break a save, an alert,
 *    or a render;
 *  - the default transport is a redacted in-memory buffer (+ dev console),
 *    which keeps the app on Expo Go (no native Sentry module). When a
 *    dev-client build adopts `@sentry/react-native`, call
 *    `configureTransport` with a Sentry-backed transport — the call sites
 *    (`trackEvent`/`captureError`) do not change.
 */
import {
  REDACTED,
  scrubValue,
  type AnalyticsEvent,
} from './domain';

export type { AnalyticsEvent } from './domain';

export type ErrorContext = Record<string, unknown>;

export type ObservabilityTransport = {
  track: (event: AnalyticsEvent) => void;
  capture: (error: unknown, context: ErrorContext) => void;
};

const MAX_BUFFERED_EVENTS = 50;
const MAX_BUFFERED_ERRORS = 20;

/** Redacted ring buffer — the "setara" store until a server sink exists. */
const eventBuffer: AnalyticsEvent[] = [];
const errorBuffer: { message: string; context: ErrorContext }[] = [];

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Unknown error';
}

// Jest renders the real `AuthGate`, so every navigation test emits a
// `screen_view` — keep that signal, but keep the test output readable.
const isTestEnv =
  typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

const defaultTransport: ObservabilityTransport = {
  track: (event) => {
    eventBuffer.push(event);
    if (eventBuffer.length > MAX_BUFFERED_EVENTS) eventBuffer.shift();
    if (__DEV__ && !isTestEnv) {
      // Already scrubbed by `trackEvent` — safe to print.
      console.info('[analytics]', event.name, event.params);
    }
  },
  capture: (error, context) => {
    errorBuffer.push({ message: messageOf(error), context });
    if (errorBuffer.length > MAX_BUFFERED_ERRORS) errorBuffer.shift();
    if (__DEV__ && !isTestEnv) {
      console.warn('[observability]', messageOf(error));
    }
  },
};

let transport: ObservabilityTransport = defaultTransport;

/**
 * Swaps the event/error destination (e.g. a Sentry-backed transport once the
 * native module is adopted). Restored with `configureTransport(undefined)`.
 */
export function configureTransport(
  next: ObservabilityTransport | undefined,
): void {
  transport = next ?? defaultTransport;
}

/** Read-only view of buffered events (debug builds / diagnostics). */
export function bufferedEvents(): readonly AnalyticsEvent[] {
  return eventBuffer;
}

/**
 * Emits an analytics event. The payload is scrubbed defensively even though
 * every builder in `domain.ts` already produces clean events — a future
 * hand-built event cannot leak by accident. Never throws.
 */
export function trackEvent(event: AnalyticsEvent): void {
  try {
    const scrubbed = scrubValue(event) as AnalyticsEvent;
    transport.track(scrubbed);
  } catch {
    // Analytics is best-effort by design (PRD §4.3).
  }
}

/**
 * Reports a non-fatal error with an optional context object. The context is
 * scrubbed, so passing a transaction or budget row is safe — financial
 * fields arrive as `[redacted]`. Never throws.
 */
export function captureError(error: unknown, context: ErrorContext = {}): void {
  try {
    const scrubbed = scrubValue(context) as ErrorContext;
    transport.capture(error, scrubbed);
  } catch {
    // Reporting must never break the code path being reported on.
  }
}

export { REDACTED };

let installed = false;

/**
 * Installs the global error handler (crash reporting, AC #1). The handler
 * records a scrubbed entry and then delegates to the previous handler, so
 * fatal-crash behaviour (redbox / crash report dialog) is unchanged.
 * Idempotent — safe to call from the root layout on every mount.
 */
export function initObservability(): void {
  if (installed) return;
  installed = true;

  const holder = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
      setGlobalHandler: (
        handler: (error: unknown, isFatal?: boolean) => void,
      ) => void;
    };
  };
  const ErrorUtils = holder.ErrorUtils;
  if (!ErrorUtils) return;

  const previous = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    captureError(error, { fatal: isFatal ?? false });
    previous(error, isFatal);
  });
}

/** Test-only reset: clears buffers and allows re-installation. */
export function resetObservabilityForTests(): void {
  installed = false;
  eventBuffer.length = 0;
  errorBuffer.length = 0;
  transport = defaultTransport;
}
