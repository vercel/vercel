/** @type {import('@ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
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
  setupFilesAfterEnv: ['@alex_neo/jest-expect-message'],
  verbose: false,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  ...(process.env.JEST_MAX_WORKERS
    ? { maxWorkers: process.env.JEST_MAX_WORKERS }
    : {}),
};
