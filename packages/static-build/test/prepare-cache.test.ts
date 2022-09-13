import { FileFsRef } from '@vercel/build-utils';
import path from 'path';
import { prepareCache } from '../src';

describe('prepareCache()', () => {
  test('should cache node_modules and .shadow-cljs', async () => {
    const files = await prepareCache({
      config: { zeroConfig: true },
      workPath: path.resolve(__dirname, './cache-fixtures/default'),
      entrypoint: 'index.js',
      files: {},
    });

    expect(files['node_modules/file']).toBeDefined();
    expect(files['.shadow-cljs/file5']).toBeDefined();
    expect(files['index.js']).toBeUndefined();
  });

  test('should cache **/node_modules/**', async () => {
    const files = await prepareCache({
      config: { zeroConfig: true },
      repoRootPath: path.resolve(__dirname, './cache-fixtures/root-path'),
      workPath: path.resolve(__dirname, './cache-fixtures/root-path/foo'),
      entrypoint: 'index.js',
      files: {},
    });

    expect(files['foo/node_modules/file']).toBeDefined();
    expect(files['node_modules/file']).toBeDefined();
    expect(files['index.js']).toBeUndefined();
  });

  test('should ignore root modules', async () => {
    const files = await prepareCache({
      config: { zeroConfig: true },
      workPath: path.resolve(__dirname, './cache-fixtures/root-path/foo'),
      entrypoint: 'index.js',
      files: {},
    });

    expect(files['node_modules/file']).toBeDefined();
    expect(
      (files['node_modules/file'] as FileFsRef).fsPath.includes(
        'cache-fixtures/root-path/foo/node_modules/file'
      )
    ).toBeTruthy();
    expect(files['index.js']).toBeUndefined();
  });

  test('should cache index.js and other/file2.js as defined in .vercel_build_output/config/build.json', async () => {
    const files = await prepareCache({
      config: { zeroConfig: true },
      workPath: path.resolve(__dirname, './cache-fixtures/withCacheConfig'),
      entrypoint: 'index.js',
      files: {},
    });

    expect(files['node_modules/file']).toBeUndefined();
    expect(files['.shadow-cljs/file5']).toBeUndefined();
    expect(files['index.js']).toBeDefined();
    expect(files['other/file2.js']).toBeDefined();
  });

  test('should cache node_modules, .cache and public folders for gatsby deployments', async () => {
    const files = await prepareCache({
      config: { zeroConfig: true },
      workPath: path.resolve(__dirname, './cache-fixtures/gatsby'),
      entrypoint: 'package.json',
      files: {},
    });

    expect(files['node_modules/file2']).toBeDefined();
    expect(files['.cache/file']).toBeDefined();
    expect(files['public/file3']).toBeDefined();
    expect(files['package.json']).toBeUndefined();
  });

  test('should cache ./vendor/bundle, ./vendor/bin, ./vendor/cache folders for jekyll deployments', async () => {
    const files = await prepareCache({
      config: { zeroConfig: true, framework: 'jekyll' },
      workPath: path.resolve(__dirname, './cache-fixtures/jekyll'),
      entrypoint: 'Gemfile',
      files: {},
    });

    expect(files['vendor/bundle/b1']).toBeDefined();
    expect(files['vendor/bin/jekyll']).toBeDefined();
    expect(files['vendor/cache/c1']).toBeDefined();

    expect(files['vendor/skip']).toBeUndefined();
    expect(files['_config.yml']).toBeUndefined();
    expect(files['_posts/hello.markdown']).toBeUndefined();
  });

  test('should cache Build Output API v3 "cache" assets from `config.json` file', async () => {
    const files = await prepareCache({
      config: {},
      workPath: path.resolve(__dirname, './cache-fixtures/build-output-api-v3'),
      entrypoint: 'package.json',
      files: {},
    });
    expect(Object.keys(files).sort()).toStrictEqual([
      'another.txt',
      'some-dir/one.txt',
      'some-dir/two.txt',
    ]);
  });
});
