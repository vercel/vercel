const path = require('path');
const { prepareCache } = require('../dist');

describe('prepareCache()', () => {
  test('should cache **/node_modules/**', async () => {
    const files = await prepareCache({
      workPath: path.resolve(__dirname, './cache-fixtures/'),
    });

    expect(files['foo/node_modules/file']).toBeDefined();
    expect(files['node_modules/file']).toBeDefined();
    expect(files['index.js']).toBeUndefined();
  });
});
