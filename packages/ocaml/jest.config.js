/** @type {import('@ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/unit/**/*.test.ts'],
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
