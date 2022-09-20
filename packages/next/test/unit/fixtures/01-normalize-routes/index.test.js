const fs = require('fs-extra');
const ms = require('ms');
const path = require('path');
const { build } = require('../../../../src');
const { FileFsRef } = require('@vercel/build-utils');

jest.setTimeout(ms('6m'));

describe(`${__dirname.split(path.sep).pop()}`, () => {
  afterEach(() => fs.remove(path.join(__dirname, 'yarn.lock')));

  it('should normalize routes in build results output', async () => {
    if (process.platform === 'win32') {
      console.log('Skipping test on windows temporarily');
      // This test is failing on Windows with the following error:
      // $ next build
      // 'next' is not recognized as an internal or external command,
      return;
    }

    const files = [
      'index.test.js',
      'next.config.js',
      'package.json',
      'pages/foo/bar/index.js',
      'pages/foo/index.js',
      'pages/index.js',
    ].reduce((filesMap, file) => {
      const fsPath = path.join(__dirname, file);
      const { mode } = fs.statSync(fsPath);
      filesMap[path] = new FileFsRef({ mode, fsPath });
      return filesMap;
    }, {});

    const { output } = await build({
      config: {},
      entrypoint: 'package.json',
      files,
      meta: {
        skipDownload: true,
      },
      repoRootPath: __dirname,
      workPath: __dirname,
    });

    const pagesDir = path.join(__dirname, '.next', 'server', 'pages');
    const pages = ['foo', 'foo/bar', 'index'];

    for (const page of pages) {
      expect(output).toHaveProperty(page);
      expect(path.resolve(output[page].fsPath)).toEqual(
        path.join(pagesDir, `${page}.html`)
      );
    }
  });
});
