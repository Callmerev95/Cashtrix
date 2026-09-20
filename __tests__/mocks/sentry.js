/**
 * Inert stand-in for `@sentry/react-native` (V1, issue #30).
 *
 * The observability sink imports the real SDK statically, and the root
 * layout (`app/_layout.tsx`) calls `initSentry()` on mount — which every
 * navigation test exercises. The native module cannot load in Jest, so it
 * is replaced here with recording no-ops. Tests that assert Sentry wiring
 * use their own injected fakes via `createSentryTransport`, never this.
 */
module.exports = {
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
};
