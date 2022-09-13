const path = require('path');
const { prepareCache } = require('../dist');

describe('prepareCache()', () => {
  test('should cache **/node_modules/**', async () => {
    const files = await prepareCache({
      repoRootPath: path.resolve(__dirname, './cache-fixtures/'),
    });

    expect(files['foo/node_modules/file']).toBeDefined();
    expect(files['node_modules/file']).toBeDefined();
    expect(files['index.js']).toBeUndefined();
  });

  test('should ignore root modules', async () => {
    const files = await prepareCache({
      workPath: path.resolve(__dirname, './cache-fixtures/foo/'),
    });

    expect(files['node_modules/file']).toBeDefined();
    expect(
      files['node_modules/file'].fsPath.includes(
        'cache-fixtures/foo/node_modules/file'
      )
    ).toBeTruthy();
    expect(files['index.js']).toBeUndefined();
  });
});
