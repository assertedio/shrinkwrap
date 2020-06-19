module.exports = {
  extends: ['@ehacke/eslint-config'],
  // Had to basically disable everything good, because this code is copied from npm
  rules: {
    'block-scoped-var': 'off',
    'consistent-return': 'off',
    'func-names': 'off',
    'jsdoc/require-param-type': 'off',
    'jsdoc/require-returns': 'off',
    'lodash/prefer-lodash-typecheck': 'off',
    'max-depth': 'off',
    'no-multi-assign': 'off',
    'no-process-env': 'off',
    'no-restricted-syntax': 'off',
    'no-secrets/no-secrets': 'off',
    'no-shadow': 'off',
    'no-unused-vars': 'off',
    'no-use-before-define': 'off',
    'no-var': 'off',
    'prefer-destructuring': 'off',
    'prefer-rest-params': 'off',
    'sonarjs/cognitive-complexity': 'off',
    'unicorn/explicit-length-check': 'off',
    'unicorn/filename-case': 'off',
    'unicorn/no-for-loop': 'off',
    'unicorn/prefer-optional-catch-binding': 'off',
    'vars-on-top': 'off',
  },
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx', '.d.ts', '.json'],
      },
      typescript: {},
    },
  },
};
