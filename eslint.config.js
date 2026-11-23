const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  { files: ['scripts/**/*.js'], languageOptions: { globals: { __dirname: 'readonly' } } },
  { ignores: ['node_modules/**', 'dist/**', '.expo/**', 'ios/**'] },
];
