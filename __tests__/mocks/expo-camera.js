/**
 * expo-camera stand-in. The native bridge does not exist in Jest — same
 * shape Expo Go sees before the preview rebuild: no CameraView, so the
 * app degrades to the legacy `expo-image-picker` path (see
 * `isScanViewfinderAvailable`). Tests that drive the viewfinder inject
 * their own mock and never touch this file (same pattern as netinfo).
 */
module.exports = {};
