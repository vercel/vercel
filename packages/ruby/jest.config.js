/** @type {import('@ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  maxConcurrency: parseInt(process.env.TEST_MAX_CONCURRENCY || '10', 10),
};
