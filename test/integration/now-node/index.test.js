/* global it, expect */
const path = require('path');
const runBuildLambda = require('../../lib/run-build-lambda');

const TWO_MINUTES = 120000;

function runBuildForFolder(folder) {
  return runBuildLambda(path.join(__dirname, folder));
}

it(
  'Should build the airtable folder',
  async () => {
    const { buildResult } = await runBuildForFolder('airtable');
    expect(buildResult['index.js']).toBeDefined();
  },
  TWO_MINUTES,
);

it(
  'Should build the aws-sdk folder',
  async () => {
    const { buildResult } = await runBuildForFolder('aws-sdk');
    expect(buildResult['index.js']).toBeDefined();
  },
  TWO_MINUTES,
);

it(
  'Should build the axios folder',
  async () => {
    const { buildResult } = await runBuildForFolder('axios');
    expect(buildResult['index.js']).toBeDefined();
  },
  TWO_MINUTES,
);

it(
  'Should build the mongoose folder',
  async () => {
    const { buildResult } = await runBuildForFolder('mongoose');
    expect(buildResult['index.js']).toBeDefined();
  },
  TWO_MINUTES,
);
