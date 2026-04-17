/** @type {import('@ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  maxConcurrency: parseInt(process.env.TEST_MAX_CONCURRENCY || '10', 10),
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
