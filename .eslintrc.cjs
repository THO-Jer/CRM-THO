// ESLint config para CRM-THO (Vite + React 18 + TypeScript)
// Usa la sintaxis legacy (.eslintrc) compatible con ESLint 8.
// Para migrar a flat config (eslint.config.js) cuando se suba a ESLint 9.
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['react-refresh', '@typescript-eslint'],
  rules: {
    // React Refresh — avisa si un módulo exporta algo que no puede hot-reload
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

    // TypeScript — relajado para mantener compatibilidad con el código migrado
    '@typescript-eslint/no-explicit-any': 'warn',         // warn, no error (hay ~17 usos intencionales)
    '@typescript-eslint/no-unused-vars': ['warn', {
      argsIgnorePattern: '^_',                            // _param = ignorar parámetros con prefijo _
      varsIgnorePattern: '^_',
      ignoreRestSiblings: true,
    }],
    '@typescript-eslint/no-non-null-assertion': 'warn',   // cuidado con el ! postfix

    // Desactivados — demasiado ruido en código migrado desde JS
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-empty-function': 'off',

    // React Hooks — detecta dependencias faltantes en useEffect/useMemo
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // JS general
    'no-console': ['warn', { allow: ['warn', 'error'] }], // bloquea console.log en prod
    'no-debugger': 'error',
    'no-duplicate-imports': 'error',
    'prefer-const': 'warn',
  },
}
