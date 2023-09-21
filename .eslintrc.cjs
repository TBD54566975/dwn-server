module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest', // Allows the use of modern ECMAScript features
    sourceType: 'module', // Allows for the use of imports
  },
  plugins: [
    '@typescript-eslint',
    'prettier',
    'todo-plz', // for enforcing TODO formatting to require "github.com/TBD54566975/dwn-server/issues/"
  ],
  env: {
    node: true, // Enable Node.js global variables
    browser: true,
  },
  rules: {
    'prettier/prettier': 'error',
    curly: ['error', 'all'],
    'no-console': 'off',
    '@typescript-eslint/explicit-function-return-type': ['error'],
    // enforce `import type` when an import is not used at runtime, allowing transpilers/bundlers to drop imports as an optimization
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        vars: 'all',
        args: 'after-used',
        ignoreRestSiblings: true,
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],
    'prefer-const': ['error', { destructuring: 'all' }],
    // enforce github issue reference for every TO-DO comment
    'todo-plz/ticket-ref': [
      'error',
      { commentPattern: '.*github.com/TBD54566975/dwn-server/issues/.*' },
    ],
  },
  extends: ['prettier'],
};
