const fs = require('fs-extra');
const ms = require('ms');
const path = require('path');
const { build, getDevManifest } = require('../../../../dist');
const { FileFsRef } = require('@vercel/build-utils');

vi.setConfig({ testTimeout: ms('6m'), hookTimeout: ms('6m') });

describe(`${__dirname.split(path.sep).pop()}`, () => {
  let restoreIndexPage;

  afterEach(async () => {
    await restoreIndexPage?.();
    restoreIndexPage = undefined;
  });

  it('should normalize routes in build results output', async () => {
    // TODO: remove after bug with edge functions on Windows
    // is resolved upstream in Next.js
    if (process.platform === 'win32') {
      const indexPage = path.join(__dirname, 'pages/index.tsx');
      const originalIndexPage = await fs.readFile(indexPage, 'utf8');
      restoreIndexPage = () => fs.writeFile(indexPage, originalIndexPage);
      await fs.writeFile(
        indexPage,
        originalIndexPage.replace('runtime: ', '// runtime: ')
      );
    }

    const files = [
      'index.test.js',
      'next.config.js',
      'package.json',
      'tsconfig.json',
      'pages/api/hello.ts',
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

    expect(output).toHaveProperty('test/api/hello');
    expect(output['test/api/hello'].type).toEqual('EdgeFunction');

    const manifest = await getDevManifest({
      workPath: __dirname,
      build: { src: 'package.json', use: '@vercel/next' },
      files: ['pages/api/hello.ts'],
      config: {
        functions: {
          'pages/api/hello.ts': {
            experimentalTriggers: [{ type: 'queue/v2beta', topic: 'orders' }],
          },
        },
      },
      env: { ...process.env, NODE_ENV: 'development' },
    });
    expect(manifest).toMatchObject({
      functions: [
        {
          outputPath: 'test/api/hello',
          sourceFile: 'pages/api/hello.ts',
          invocation: { type: 'http', pathname: '/test/api/hello' },
          experimentalTriggers: [{ type: 'queue/v2beta', topic: 'orders' }],
        },
      ],
      matchedFunctionPatterns: ['pages/api/hello.ts'],
    });
    expect(output[manifest.functions[0].outputPath].type).toBe('EdgeFunction');

    const unconfigured = await getDevManifest({
      workPath: __dirname,
      build: { src: 'package.json', use: '@vercel/next' },
      files: ['pages/api/hello.ts', 'pages/index.tsx'],
      config: { functions: {} },
      env: { ...process.env, NODE_ENV: 'development' },
    });
    expect(unconfigured).toEqual({
      functions: [
        {
          outputPath: 'test/api/hello',
          sourceFile: 'pages/api/hello.ts',
          invocation: { type: 'http', pathname: '/test/api/hello' },
        },
      ],
      matchedFunctionPatterns: [],
    });

    for (const name in output) {
      expect(output[name].type).not.toBe('Lambda');
    }
  });
});
