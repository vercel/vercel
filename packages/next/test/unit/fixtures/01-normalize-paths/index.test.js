const fs = require('fs-extra');
const ms = require('ms');
const path = require('path');
const { build } = require('../../../../dist');
const { FileFsRef } = require('@vercel/build-utils');

jest.setTimeout(ms('6m'));

describe(`${__dirname.split(path.sep).pop()}`, () => {
  it('should normalize routes in build results output', async () => {
    const files = [
      'index.test.js',
      'next.config.js',
      'package.json',
      'data/strings.json',
      'pages/foo/bar/index.js',
      'pages/foo/index.js',
      'pages/index.js',
    ].reduce((filesMap, file) => {
      const fsPath = path.join(__dirname, file);
      const { mode } = fs.statSync(fsPath);
      filesMap[path] = new FileFsRef({ mode, fsPath });
      return filesMap;
    }, {});

    const { output, routes } = await build({
      config: {
        installCommand: 'yarn',
      },
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
      if (page === 'index') {
        const { files, type } = output[page];
        expect(type).toEqual('Lambda');
        expect(files).toHaveProperty([path.join('data', 'strings.json')]);
      } else {
        expect(path.resolve(output[page].fsPath)).toEqual(
          path.join(pagesDir, `${page}.html`)
        );
      }
    }

    for (const route of routes) {
      if (typeof route.src === 'string') {
        // src must start with a forward slash (or caret if a regex)
        expect(route.src).toMatch(/^[/^]/);
      }
      if (typeof route.dest === 'string') {
        // dest can be `/400` or `/.*` or `$0`, but not start with \
        expect(route.dest).not.toMatch(/^\\/);
      }
    }
  });
});
