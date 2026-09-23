/**
 * expo-local-authentication stand-in (B4, ADR-0007). The native bridge does
 * not exist in Jest — same shape Expo Go sees before the deferred preview
 * rebuild: the JS module loads, but every capability call throws. The app
 * must degrade to "unavailable" instead of crashing the JS loop, and this
 * default stand-in proves that path. Tests that drive a happy-path unlock
 * inject their own mock and never touch this file (same pattern as netinfo).
 */
const unavailable = () => {
  throw new Error('local-authentication native module unavailable');
};

module.exports = {
  __esModule: true,
  hasHardwareAsync: unavailable,
  isEnrolledAsync: unavailable,
  authenticateAsync: unavailable,
};
