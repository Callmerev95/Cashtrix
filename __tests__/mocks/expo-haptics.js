/**
 * expo-haptics stand-in (B1, ADR-0016). The native bridge does not exist
 * in Jest — same shape Expo Go sees before the single preview rebuild:
 * the JS module loads and every call resolves. The app must still
 * never-throw when the bridge rejects, and the absent-module path is
 * proved by `haptics-absent.test.ts`, which injects its own throwing
 * mock and never touches this file (same pattern as netinfo).
 */
module.exports = {
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
    Soft: 'soft',
    Rigid: 'rigid',
  },
};
