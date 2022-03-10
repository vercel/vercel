const { prepareCache } = require('../dist');
const path = require('path');

describe('prepareCache', () => {
  test('should cache node_modules and .shadow-cljs', async () => {
    const files = await prepareCache({
      config: { zeroConfig: true },
      workPath: path.resolve(__dirname, './cache-fixtures/default'),
      entrypoint: 'index.js',
    });

    expect(files['node_modules/file']).toBeDefined();
    expect(files['.shadow-cljs/file5']).toBeDefined();
    expect(files['index.js']).toBeUndefined();
  });

  test('should cache index.js and other/file2.js as defined in .vercel_build_output/config/build.json', async () => {
    const files = await prepareCache({
      config: { zeroConfig: true },
      workPath: path.resolve(__dirname, './cache-fixtures/withCacheConfig'),
      entrypoint: 'index.js',
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
    });

    expect(files['vendor/bundle/b1']).toBeDefined();
    expect(files['vendor/bin/jekyll']).toBeDefined();
    expect(files['vendor/cache/c1']).toBeDefined();

    expect(files['vendor/skip']).toBeUndefined();
    expect(files['_config.yml']).toBeUndefined();
    expect(files['_posts/hello.markdown']).toBeUndefined();
  });
});
