/** @type {import('@ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  globals: {
    'ts-jest': {
      diagnostics: false,
      isolatedModules: true,
    },
  },
  setupFilesAfterEnv: ['@alex_neo/jest-expect-message'],
  verbose: false,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
};
