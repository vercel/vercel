const fs = require('fs-extra');
const ms = require('ms');
const path = require('path');
const { build } = require('../../../../dist');
const { FileFsRef } = require('@vercel/build-utils');

jest.setTimeout(ms('6m'));

describe(`${__dirname.split(path.sep).pop()}`, () => {
  it('should normalize routes in build results output', async () => {
    // TODO: remove after bug with edge functions on Windows
    // is resolved upstream in Next.js
    if (process.platform === 'win32') {
      const indexPage = path.join(__dirname, 'pages/index.tsx');
      await fs.writeFile(
        indexPage,
        (await fs.readFile(indexPage, 'utf8')).replace(
          'runtime: ',
          '// runtime: '
        )
      );
    }

    const files = [
      'index.test.js',
      'next.config.js',
      'package.json',
      'tsconfig.json',
      'pages/index.tsx',
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

    const lambdaPaths = [];

    for (const key in output) {
      if (output[key].type === 'Lambda') {
        lambdaPaths.push(key);
      }
    }

    expect(lambdaPaths).toEqual(
      [],
      `Unexpected paths with type "Lambda": ${lambdaPaths.join(', ')}`
    );
  });
});
