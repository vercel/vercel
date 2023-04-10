import path from 'path';
import assert from 'assert';
import { prepareCache } from '../../src';

describe('prepareCache()', () => {
  test('should cache `**/node_modules/**`', async () => {
    const files = await prepareCache({
      files: {},
      entrypoint: '.',
      config: {},
      workPath: path.resolve(__dirname, '../cache-fixtures/'),
      repoRootPath: path.resolve(__dirname, '../cache-fixtures/'),
    });

    expect(files['foo/node_modules/file']).toBeDefined();
    expect(files['node_modules/file']).toBeDefined();
    expect(files['index.js']).toBeUndefined();
  });

  test('should ignore root modules', async () => {
    const files = await prepareCache({
      files: {},
      entrypoint: '.',
      config: {},
      workPath: path.resolve(__dirname, '../cache-fixtures/foo/'),
    });

    const file = files['node_modules/file'];
    expect(file).toBeDefined();
    assert(file.type === 'FileFsRef');
    expect(
      file.fsPath.includes('cache-fixtures/foo/node_modules/file')
    ).toBeTruthy();
    expect(files['index.js']).toBeUndefined();
  });
});
