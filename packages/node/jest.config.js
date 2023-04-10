/** @type {import('@ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
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
