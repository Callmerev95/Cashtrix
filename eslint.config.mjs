// ESLint flat config.
//
// The `no-restricted-syntax` rule below enforces the AGENTS.md / PRD §4.5
// rule: hex colour literals live ONLY in the theme file. Every other file
// must consume tokens from `@/theme`.
import expoConfig from 'eslint-config-expo/flat.js';

const HEX_LITERAL_RULE = [
  'error',
  {
    selector:
      "Literal[value=/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
    message:
      'Hex colour literals are only allowed in src/theme/theme.ts. Import a token from @/theme instead (PRD §4.5).',
  },
  {
    selector:
      "TemplateElement[value.raw=/^\\s*#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\s*$/]",
    message:
      'Hex colour literals are only allowed in src/theme/theme.ts. Import a token from @/theme instead (PRD §4.5).',
  },
];

export default [
  ...expoConfig,
  {
    ignores: ['node_modules/**', 'dist/**', '.expo/**', 'assets/**'],
  },
  {
    rules: {
      'no-restricted-syntax': HEX_LITERAL_RULE,
    },
  },
  {
    // The theme file is the one sanctioned home for hex literals. Tests are
    // also exempt: asserting the canonical hex values verbatim is the point
    // of the theme guard test.
    files: ['src/theme/theme.ts', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '__tests__/**/*'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        jest: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
    },
    rules: {
      // Test-only: expo-router's renderRouter takes a route map of components,
      // and jest.mock factories must not close over out-of-scope bindings.
      // Both are unsupported by ESM static imports.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
