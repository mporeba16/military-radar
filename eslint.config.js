import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

// Scope: catch real errors (undefined refs, unreachable code, broken hook
// usage) — not style. We deliberately enable only the two classic react-hooks
// rules (rules-of-hooks + exhaustive-deps) and NOT the newer React-Compiler
// rule set, which flags several intentional long-standing patterns here.
export default [
  { ignores: ['dist/**', 'node_modules/**', '.netlify/**'] },

  // Frontend — browser + React (JSX)
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      'react/jsx-uses-vars': 'error',   // count JSX identifiers as "used"
      'react/jsx-uses-react': 'off',    // React 17+ automatic runtime
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // Netlify functions — Node runtime (fetch/crypto/URL/AbortSignal are globals on Node 18+)
  {
    files: ['netlify/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        fetch: 'readonly',
        crypto: 'readonly',
        URL: 'readonly',
        AbortSignal: 'readonly',
        TextEncoder: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
]
