/* eslint-env jest */
const path = require('path');
const { deployAndTest } = require('../../utils');
const { createRunBuildLambda } = require('../../../../../test/lib/run-build-lambda');
const builder = require('../../..');

const runBuildLambda = createRunBuildLambda(builder);

describe(`${__dirname.split(path.sep).pop()}`, () => {
  it('should deploy and pass probe checks', async () => {
    await deployAndTest(__dirname);
  });

  it('should output metadata files as static rather than prerender', async () => {
    const { buildResult } = await runBuildLambda(__dirname);
    
    // Check that metadata files are output as static files
    const staticFiles = [
      'favicon.ico',
      'icon.svg',
      'twitter-image.png',
      'foo/icon.png'
    ];

    staticFiles.forEach(file => {
      expect(buildResult.output[file]).toBeDefined();
      expect(buildResult.output[file].type).toBe('FileFsRef');
    });

    // Ensure these are NOT prerender files
    staticFiles.forEach(file => {
      expect(buildResult.output[file].type).not.toBe('Prerender');
    });

    // Source file opengrapg-image/route.js is not a valid metadata route.
    // Verify that the dynamic opengraph-image route handler is present as a lambda
    expect(buildResult.output['opengraph-image.png']).toBeDefined();
    expect(buildResult.output['opengraph-image.png'].type).toBe('Lambda');
  });
});