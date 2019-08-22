const { execSync } = require('child_process');
const { relative } = require('path');

// TODO: run tests on all packages except now-cli
const matches = ['now-node'];

const testMatch = matches.map(
  item => `**/${item}/**/?(*.)+(spec|test).[jt]s?(x)`,
);

module.exports = {
  testEnvironment: 'node',
  testMatch
};
