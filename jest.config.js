module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'packages/(!test)/**/*.{js,jsx}',
    '!**/node_modules/**',
    '!**/test/**',
  ],
};
