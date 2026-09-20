const js = require('@eslint/js');

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  console: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  requestAnimationFrame: 'readonly',
  IntersectionObserver: 'readonly',
  URLSearchParams: 'readonly'
};

module.exports = [
  {
    files: ['docs/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: { ...browserGlobals, module: 'readonly' }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': ['error', { caughtErrorsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'off'
    }
  },
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { require: 'readonly', module: 'readonly', process: 'readonly', __dirname: 'readonly', console: 'readonly' }
    },
    rules: {
      ...js.configs.recommended.rules,
      eqeqeq: ['error', 'smart']
    }
  }
];
