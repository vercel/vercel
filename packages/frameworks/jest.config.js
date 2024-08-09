/** @type {import('@ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        diagnostics: true,
        isolatedModules: true,
        tsconfig: 'test/tsconfig.json',
      },
    ],
  },
};
