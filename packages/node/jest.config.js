/** @type {import('@ts-jest/dist/types').InitialOptionsTsJest} */

const { defaults } = require('jest-config');

module.exports = {
  preset: 'ts-jest',
  moduleFileExtensions: [...defaults.moduleFileExtensions, 'mts'],
  transform: {
    '^.+\\.m?[tj]s$': [
      'ts-jest',
      {
        diagnostics: true,
        isolatedModules: true,
      },
    ],
  },
};
