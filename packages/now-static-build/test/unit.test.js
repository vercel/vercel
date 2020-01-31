const { prepareCache } = require('../dist');
const path = require('path');

describe('prepareCache', () => {
  test('should cache node_modules', async () => {
    const files = await prepareCache({
      config: { zeroConfig: true },
      workPath: path.resolve(__dirname, './cache-fixtures/default'),
      entrypoint: 'index.js',
    });

    expect(files['node_modules/file']).toBeDefined();
    expect(files['index.js']).toBeUndefined();
  });

  test('should cache node_modules, .cache and public folders for gatsby deployments', async () => {
    const files = await prepareCache({
      config: { zeroConfig: true },
      workPath: path.resolve(__dirname, './cache-fixtures/gatsby'),
      entrypoint: 'package.json',
    });

    expect(files['node_modules/file2']).toBeDefined();
    expect(files['.cache/file']).toBeDefined();
    expect(files['public/file3']).toBeDefined();
    expect(files['package.json']).toBeUndefined();
  });
});
