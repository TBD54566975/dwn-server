module.exports = {
  extends       : ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:mocha/recommended'],
  parser        : '@typescript-eslint/parser',
  parserOptions : {
    ecmaVersion : 2022,
    sourceType  : 'module'
  },
  plugins : ['@typescript-eslint', 'mocha'],
  env     : {
    node   : true,
    es2022 : true
  },
  rules: {
    'key-spacing': ['error'],
    'semi-spacing': ['error', { 'before': false, 'after': true }],
    'quotes': [
      'error',
      'single',
      { 'allowTemplateLiterals': true }
    ],
    'semi'                              : ['error', 'always'],
    'indent'                            : ['error', 2],
    '@typescript-eslint/no-unused-vars' : [
      'error',
      {
        'vars'               : 'all',
        'args'               : 'after-used',
        'ignoreRestSiblings' : true,
        'argsIgnorePattern'  : '^_',
        'varsIgnorePattern'  : '^_'
      }
    ],
    '@typescript-eslint/no-explicit-any' : 'off',
    'no-trailing-spaces'                 : ['error'],
    '@typescript-eslint/ban-ts-comment'  : 'off',
    'keyword-spacing' : ['error', { 'before': true }],
    'comma-dangle': ['error', 'always-multiline'],
    'eol-last': ['error', 'always'],
  }
};
