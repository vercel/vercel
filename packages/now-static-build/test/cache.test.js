const { prepareCache } = require('../dist');
const path = require('path');

describe('prepareCache', () => {
  test('should cache yarn.lock, package-lock.json and node_modules', async () => {
    const files = await prepareCache({
      workPath: path.resolve(__dirname, './cache-fixtures/default'),
      entrypoint: 'index.js',
    });

    expect(files['yarn.lock']).toBeDefined();
    expect(files['package-lock.json']).toBeDefined();
    expect(files['node_modules/file']).toBeDefined();

    expect(files['index.js']).toBeUndefined();
  });

  test('should cache `.cache` folder for gatsby deployments', async () => {
    const files = await prepareCache({
      workPath: path.resolve(__dirname, './cache-fixtures/gatsby'),
      entrypoint: 'package.json',
    });

    expect(files['.cache/file']).toBeDefined();
    expect(files['yarn.lock']).toBeDefined();
  });
});
