/**
 * expo-localization stand-in — OS locale Indonesian. The native module cannot
 * load in Jest, so locale resolution tests exercise `resolveLanguage` (pure)
 * plus `detectLanguage` against this stand-in; tests that drive English
 * inject their own mock and never touch this file (same pattern as netinfo).
 */
module.exports = {
  __esModule: true,
  locale: 'id-ID',
  getLocales: () => [
    {
      languageTag: 'id-ID',
      languageCode: 'id',
      regionCode: 'ID',
    },
  ],
};
