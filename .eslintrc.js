/** ESLint configuration for the CodePulse repository (TypeScript server under /server). */

const path = require('path');

const serverDir = path.join(__dirname, 'server');

module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '**/dist/',
    'coverage/',
    '.nyc_output/',
    '**/testCode.ts',
  ],
  parser: require.resolve('@typescript-eslint/parser', { paths: [serverDir] }),
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    require.resolve('eslint-config-prettier', { paths: [serverDir] }),
  ],
  rules: {
    'no-console': 'warn',
    'prefer-const': 'error',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
  },
};
