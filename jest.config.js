// Jest configuration — jest-expo preset, mapped to the project's @/ alias.
const preset = require('jest-expo/jest-preset');

module.exports = {
  ...preset,
  moduleNameMapper: {
    ...preset.moduleNameMapper,
    // Keep the project alias last so it wins for @/ imports.
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'app/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
};
