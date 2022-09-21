const { resolve } = require('path');

const baseConfig = require.resolve('../../.eslintrc.cjs');

const project = resolve(__dirname, 'tsconfig.json');

module.exports = {
  root: true,
  extends: [baseConfig],
  parserOptions: {
    project,
  },
  settings: {
    'import/resolver': {
      typescript: {
        project,
      },
    },
  },
};
