import { describe, test, expect } from 'vitest';
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

  test('should cache `**/.yarn/cache/**`', async () => {
    const files = await prepareCache({
      files: {},
      entrypoint: '.',
      config: {},
      workPath: path.resolve(__dirname, '../cache-fixtures/'),
      repoRootPath: path.resolve(__dirname, '../cache-fixtures/'),
    });

    expect(files['foo/.yarn/cache/file']).toBeDefined();
    expect(files['.yarn/cache/file']).toBeDefined();
  });

  test('should ignore root modules', async () => {
    const files = await prepareCache({
      files: {},
      entrypoint: '.',
      config: {},
      workPath: path.resolve(__dirname, '../cache-fixtures/foo/'),
      repoRootPath: path.resolve(__dirname, '../cache-fixtures/foo/'),
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
