const path = require('path');
const fs = require('fs-extra');
const assert = require('assert');
const { createZip } = require('../dist/lambda');
const {
  glob,
  download,
  detectBuilders,
  detectRoutes,
  spawnAsync,
} = require('../');
const {
  getSupportedNodeVersion,
  defaultSelection,
} = require('../dist/fs/node-version');

it('should re-create symlinks properly', async () => {
  const files = await glob('**', path.join(__dirname, 'symlinks'));
  assert.equal(Object.keys(files).length, 2);

  const outDir = path.join(__dirname, 'symlinks-out');
  await fs.remove(outDir);

  const files2 = await download(files, outDir);
  assert.equal(Object.keys(files2).length, 2);

  const [linkStat, aStat] = await Promise.all([
    fs.lstat(path.join(outDir, 'link.txt')),
    fs.lstat(path.join(outDir, 'a.txt')),
  ]);
  assert(linkStat.isSymbolicLink());
  assert(aStat.isFile());
});

it('should create zip files with symlinks properly', async () => {
  const files = await glob('**', path.join(__dirname, 'symlinks'));
  assert.equal(Object.keys(files).length, 2);

  const outFile = path.join(__dirname, 'symlinks.zip');
  await fs.remove(outFile);

  const outDir = path.join(__dirname, 'symlinks-out');
  await fs.remove(outDir);
  await fs.mkdirp(outDir);

  await fs.writeFile(outFile, await createZip(files));
  await spawnAsync('unzip', [outFile], { cwd: outDir });

  const [linkStat, aStat] = await Promise.all([
    fs.lstat(path.join(outDir, 'link.txt')),
    fs.lstat(path.join(outDir, 'a.txt')),
  ]);
  assert(linkStat.isSymbolicLink());
  assert(aStat.isFile());
});

it('should only match supported node versions', async () => {
  expect(await getSupportedNodeVersion('10.x')).toHaveProperty('major', 10);
  expect(await getSupportedNodeVersion('8.10.x')).toHaveProperty('major', 8);
  expect(getSupportedNodeVersion('8.11.x')).rejects.toThrow();
  expect(getSupportedNodeVersion('6.x')).rejects.toThrow();
  expect(getSupportedNodeVersion('999.x')).rejects.toThrow();
  expect(getSupportedNodeVersion('foo')).rejects.toThrow();
  expect(await getSupportedNodeVersion('')).toBe(defaultSelection);
  expect(await getSupportedNodeVersion(null)).toBe(defaultSelection);
  expect(await getSupportedNodeVersion(undefined)).toBe(defaultSelection);
});

it('should match all semver ranges', async () => {
  // See https://docs.npmjs.com/files/package.json#engines
  expect(await getSupportedNodeVersion('10.0.0')).toHaveProperty('major', 10);
  expect(await getSupportedNodeVersion('10.x')).toHaveProperty('major', 10);
  expect(await getSupportedNodeVersion('>=10')).toHaveProperty('major', 12);
  expect(await getSupportedNodeVersion('>=10.3.0')).toHaveProperty('major', 12);
  expect(await getSupportedNodeVersion('8.5.0 - 10.5.0')).toHaveProperty(
    'major',
    10
  );
  expect(await getSupportedNodeVersion('>=9.5.0 <=10.5.0')).toHaveProperty(
    'major',
    10
  );
  expect(await getSupportedNodeVersion('~10.5.0')).toHaveProperty('major', 10);
  expect(await getSupportedNodeVersion('^10.5.0')).toHaveProperty('major', 10);
});

it('should support require by path for legacy builders', () => {
  const index = require('@now/build-utils');

  const download2 = require('@now/build-utils/fs/download.js');
  const getWriteableDirectory2 = require('@now/build-utils/fs/get-writable-directory.js');
  const glob2 = require('@now/build-utils/fs/glob.js');
  const rename2 = require('@now/build-utils/fs/rename.js');
  const {
    runNpmInstall: runNpmInstall2,
  } = require('@now/build-utils/fs/run-user-scripts.js');
  const streamToBuffer2 = require('@now/build-utils/fs/stream-to-buffer.js');

  const FileBlob2 = require('@now/build-utils/file-blob.js');
  const FileFsRef2 = require('@now/build-utils/file-fs-ref.js');
  const FileRef2 = require('@now/build-utils/file-ref.js');
  const { Lambda: Lambda2 } = require('@now/build-utils/lambda.js');

  expect(download2).toBe(index.download);
  expect(getWriteableDirectory2).toBe(index.getWriteableDirectory);
  expect(glob2).toBe(index.glob);
  expect(rename2).toBe(index.rename);
  expect(runNpmInstall2).toBe(index.runNpmInstall);
  expect(streamToBuffer2).toBe(index.streamToBuffer);

  expect(FileBlob2).toBe(index.FileBlob);
  expect(FileFsRef2).toBe(index.FileFsRef);
  expect(FileRef2).toBe(index.FileRef);
  expect(Lambda2).toBe(index.Lambda);
});

describe('Test `detectBuilders`', () => {
  it('package.json + no build command', async () => {
    const detected = { framework: { slug: 'next', version: '9.0.0' } };
    const files = ['package.json', 'pages/index.js', 'public/index.html'];
    const { builders } = await detectBuilders(files, detected);
    expect(builders.length).toBe(1);
    expect(builders[0].src).toBe('public/**/*');
    expect(builders[0].use).toBe('@now/static');
  });

  it('package.json + build command + next', async () => {
    const detected = {
      buildCommand: 'yarn build',
      framework: {
        slug: 'next',
        version: '9.0.0',
      },
    };
    const files = ['package.json', 'pages/index.js'];
    const { builders, errors } = await detectBuilders(files, detected);
    expect(builders[0].use).toBe('@now/next');
    expect(errors).toBe(null);
  });

  it('no detectors + no build command', async () => {
    const files = ['package.json'];
    const { builders, errors } = await detectBuilders(files, {});
    expect(builders).toBe(null);
    expect(errors).toBe(null);
  });

  it('static file', async () => {
    const files = ['index.html'];
    const { builders, errors } = await detectBuilders(files);
    expect(builders).toBe(null);
    expect(errors).toBe(null);
  });

  it('no package.json + public + api', async () => {
    const files = ['api/users.js', 'public/index.html'];
    const { builders, errors } = await detectBuilders(files);
    expect(builders[1].use).toBe('@now/static');
    expect(errors).toBe(null);
  });

  it('no package.json + no build + raw static + api', async () => {
    const files = ['api/users.js', 'index.html'];
    const { builders, errors } = await detectBuilders(files);
    expect(builders[0].use).toBe('@now/node');
    expect(builders[0].src).toBe('api/users.js');
    expect(builders[1].use).toBe('@now/static');
    expect(builders[1].src).toBe('!{api/**,package.json}');
    expect(builders.length).toBe(2);
    expect(errors).toBe(null);
  });

  it('no package.json + no build command + root + api', async () => {
    const files = ['index.html', 'api/[endpoint].js', 'static/image.png'];
    const { builders, errors } = await detectBuilders(files);
    expect(builders[0].use).toBe('@now/node');
    expect(builders[0].src).toBe('api/[endpoint].js');
    expect(builders[1].use).toBe('@now/static');
    expect(builders[1].src).toBe('!{api/**,package.json}');
    expect(builders.length).toBe(2);
    expect(errors).toBe(null);
  });

  it('api + ignore files', async () => {
    const files = [
      'api/_utils/handler.js',
      'api/[endpoint]/.helper.js',
      'api/[endpoint]/[id].js',
    ];

    const { builders } = await detectBuilders(files);
    expect(builders[0].use).toBe('@now/node');
    expect(builders[0].src).toBe('api/[endpoint]/[id].js');
    expect(builders.length).toBe(1);
  });

  it('api + next + public', async () => {
    const detected = {
      buildCommand: 'yarn build',
      framework: {
        slug: 'next',
        version: '9.0.0',
      },
    };

    const files = ['package.json', 'api/endpoint.js', 'public/index.html'];

    const { builders } = await detectBuilders(files, detected);
    expect(builders[0].use).toBe('@now/node');
    expect(builders[0].src).toBe('api/endpoint.js');
    expect(builders[1].use).toBe('@now/next');
    expect(builders[1].src).toBe('package.json');
    expect(builders.length).toBe(2);
  });

  it('api + next + raw static', async () => {
    const detected = {
      buildCommand: 'yarn build',
      framework: {
        slug: 'next',
        version: '9.0.0',
      },
    };

    const files = ['package.json', 'api/endpoint.js', 'index.html'];

    const { builders } = await detectBuilders(files, detected);
    expect(builders[0].use).toBe('@now/node');
    expect(builders[0].src).toBe('api/endpoint.js');
    expect(builders[1].use).toBe('@now/next');
    expect(builders[1].src).toBe('package.json');
    expect(builders.length).toBe(2);
  });

  it('api + raw static', async () => {
    const files = ['api/endpoint.js', 'index.html', 'favicon.ico'];

    const { builders } = await detectBuilders(files);
    expect(builders[0].use).toBe('@now/node');
    expect(builders[0].src).toBe('api/endpoint.js');
    expect(builders[1].use).toBe('@now/static');
    expect(builders[1].src).toBe('!{api/**,package.json}');
    expect(builders.length).toBe(2);
  });

  it('api + public', async () => {
    const files = [
      'api/endpoint.js',
      'public/index.html',
      'public/favicon.ico',
      'README.md',
    ];

    const { builders } = await detectBuilders(files);
    expect(builders[0].use).toBe('@now/node');
    expect(builders[0].src).toBe('api/endpoint.js');
    expect(builders[1].use).toBe('@now/static');
    expect(builders[1].src).toBe('public/**/*');
    expect(builders.length).toBe(2);
  });

  it('just public', async () => {
    const files = ['public/index.html', 'public/favicon.ico', 'README.md'];

    const { builders } = await detectBuilders(files);
    expect(builders[0].src).toBe('public/**/*');
    expect(builders.length).toBe(1);
  });

  it('next + public', async () => {
    const detected = {
      buildCommand: 'yarn build',
      framework: {
        slug: 'next',
        version: '9.0.0',
      },
    };

    const files = ['package.json', 'public/index.html', 'README.md'];

    const { builders } = await detectBuilders(files, detected);
    expect(builders[0].use).toBe('@now/next');
    expect(builders[0].src).toBe('package.json');
    expect(builders.length).toBe(1);
  });

  it('nuxt', async () => {
    const detected = {
      buildCommand: 'yarn build',
      framework: {
        slug: '@vue/cli-service',
        version: '2.8.1',
      },
    };

    const files = ['package.json', 'pages/index.js'];

    const { builders } = await detectBuilders(files, detected);
    expect(builders[0].use).toBe('@now/static-build');
    expect(builders[0].src).toBe('package.json');
    expect(builders.length).toBe(1);
  });

  it('nuxt + tag canary', async () => {
    const detected = {
      buildCommand: 'yarn build',
      framework: {
        slug: '@vue/cli-service',
        version: '2.8.1',
      },
    };

    const files = ['package.json', 'pages/index.js'];

    const { builders } = await detectBuilders(files, detected, {
      tag: 'canary',
    });
    expect(builders[0].use).toBe('@now/static-build@canary');
    expect(builders[0].src).toBe('package.json');
    expect(builders.length).toBe(1);
  });

  it('no build command + api', async () => {
    const detected = {
      framework: {
        slug: 'next',
        version: '9.0.0',
      },
    };
    const files = ['package.json', 'api/[endpoint].js'];

    const { builders } = await detectBuilders(files, detected);
    expect(builders[0].use).toBe('@now/node');
    expect(builders[0].src).toBe('api/[endpoint].js');
    expect(builders.length).toBe(1);
  });

  it('no build command + public directory', async () => {
    const detected = {
      framework: {
        slug: 'next',
        version: '9.0.0',
      },
    };
    const files = ['package.json', 'public/index.html'];

    const { builders, errors } = await detectBuilders(files, detected);
    expect(builders.length).toBe(1);
    expect(errors).toBe(null);
  });

  it('no package.json + api', async () => {
    const files = ['api/[endpoint].js', 'api/[endpoint]/[id].js'];

    const { builders } = await detectBuilders(files);
    expect(builders.length).toBe(2);
  });

  it('no package.json + no api', async () => {
    const files = ['index.html'];

    const { builders, errors } = await detectBuilders(files);
    expect(builders).toBe(null);
    expect(errors).toBe(null);
  });

  it('package.json + api + canary', async () => {
    const detected = {
      buildCommand: 'yarn build',
      framework: {
        slug: 'next',
        version: '9.0.0',
      },
    };

    const files = [
      'pages/index.js',
      'api/[endpoint].js',
      'api/[endpoint]/[id].js',
    ];

    const { builders } = await detectBuilders(files, detected, {
      tag: 'canary',
    });
    expect(builders[0].use).toBe('@now/node@canary');
    expect(builders[1].use).toBe('@now/node@canary');
    expect(builders[2].use).toBe('@now/next@canary');
    expect(builders.length).toBe(3);
  });

  it('package.json + api + latest', async () => {
    const detected = {
      buildCommand: 'yarn build',
      framework: {
        slug: 'next',
        version: '9.0.0',
      },
    };

    const files = [
      'pages/index.js',
      'api/[endpoint].js',
      'api/[endpoint]/[id].js',
    ];

    const { builders } = await detectBuilders(files, detected, {
      tag: 'latest',
    });
    expect(builders[0].use).toBe('@now/node@latest');
    expect(builders[1].use).toBe('@now/node@latest');
    expect(builders[2].use).toBe('@now/next@latest');
    expect(builders.length).toBe(3);
  });

  it('package.json + api + random tag', async () => {
    const detected = {
      buildCommand: 'yarn build',
      framework: {
        slug: 'next',
        version: '9.0.0',
      },
    };

    const files = [
      'pages/index.js',
      'api/[endpoint].js',
      'api/[endpoint]/[id].js',
    ];

    const { builders } = await detectBuilders(files, detected, { tag: 'haha' });
    expect(builders[0].use).toBe('@now/node@haha');
    expect(builders[1].use).toBe('@now/node@haha');
    expect(builders[2].use).toBe('@now/next@haha');
    expect(builders.length).toBe(3);
  });

  it('next.js pages/api + api', async () => {
    const detected = {
      buildCommand: 'yarn build',
      framework: {
        slug: 'next',
        version: '9.0.0',
      },
    };

    const files = ['api/user.js', 'pages/api/user.js'];

    const { warnings, errors, builders } = await detectBuilders(
      files,
      detected
    );

    expect(errors).toBe(null);
    expect(warnings[0]).toBeDefined();
    expect(warnings[0].code).toBe('conflicting_files');
    expect(builders).toBeDefined();
    expect(builders.length).toBe(2);
    expect(builders[0].use).toBe('@now/node');
    expect(builders[1].use).toBe('@now/next');
  });

  it('many static files + one api file', async () => {
    const files = Array.from({ length: 5000 }).map((_, i) => `file${i}.html`);
    files.push('api/index.ts');
    const { builders } = await detectBuilders(files);

    expect(builders.length).toBe(2);
    expect(builders[0].use).toBe('@now/node');
    expect(builders[0].src).toBe('api/index.ts');
    expect(builders[1].use).toBe('@now/static');
    expect(builders[1].src).toBe('!{api/**,package.json}');
  });

  it('functions with nextjs', async () => {
    const detected = {
      buildCommand: 'yarn build',
      framework: {
        slug: 'next',
        version: '9.0.0',
      },
    };
    const functions = {
      'pages/api/teams/**': {
        memory: 128,
        maxDuration: 10,
      },
    };
    const files = [
      'package.json',
      'pages/index.js',
      'pages/api/teams/members.ts',
    ];
    const { builders, errors } = await detectBuilders(files, detected, {
      functions,
    });

    expect(errors).toBe(null);
    expect(builders.length).toBe(1);
    expect(builders[0]).toEqual({
      src: 'package.json',
      use: '@now/next',
      config: {
        zeroConfig: true,
        buildCommand: 'yarn build',
        framework: {
          slug: 'next',
          version: '9.0.0',
        },
        functions: {
          'pages/api/teams/**': {
            memory: 128,
            maxDuration: 10,
          },
        },
      },
    });
  });

  it('extend with functions', async () => {
    const detected = {
      buildCommand: 'yarn build',
      framework: {
        slug: 'next',
        version: '9.0.0',
      },
    };
    const functions = {
      'api/users/*.ts': {
        runtime: 'my-custom-runtime-package@1.0.0',
      },
      'api/teams/members.ts': {
        memory: 128,
        maxDuration: 10,
      },
    };
    const files = [
      'package.json',
      'pages/index.js',
      'api/users/[id].ts',
      'api/teams/members.ts',
    ];
    const { builders } = await detectBuilders(files, detected, { functions });

    expect(builders.length).toBe(3);
    expect(builders[0]).toEqual({
      src: 'api/teams/members.ts',
      use: '@now/node',
      config: {
        zeroConfig: true,
        functions: {
          'api/teams/members.ts': {
            memory: 128,
            maxDuration: 10,
          },
        },
      },
    });
    expect(builders[1]).toEqual({
      src: 'api/users/[id].ts',
      use: 'my-custom-runtime-package@1.0.0',
      config: {
        zeroConfig: true,
        functions: {
          'api/users/*.ts': {
            runtime: 'my-custom-runtime-package@1.0.0',
          },
        },
      },
    });
    expect(builders[2]).toEqual({
      src: 'package.json',
      use: '@now/next',
      config: {
        zeroConfig: true,
        buildCommand: 'yarn build',
        framework: {
          slug: 'next',
          version: '9.0.0',
        },
      },
    });
  });

  it('invalid function key', async () => {
    const functions = { ['a'.repeat(1000)]: { memory: 128 } };
    const files = ['pages/index.ts'];
    const { builders, errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(builders).toBe(null);
    expect(errors.length).toBe(1);
    expect(errors[0].code).toBe('invalid_function_glob');
  });

  it('invalid function maxDuration', async () => {
    const functions = { 'pages/index.ts': { maxDuration: -1 } };
    const files = ['pages/index.ts'];
    const { builders, errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(builders).toBe(null);
    expect(errors.length).toBe(1);
    expect(errors[0].code).toBe('invalid_function_duration');
  });

  it('invalid function memory', async () => {
    const functions = { 'pages/index.ts': { memory: 200 } };
    const files = ['pages/index.ts'];
    const { builders, errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(builders).toBe(null);
    expect(errors.length).toBe(1);
    expect(errors[0].code).toBe('invalid_function_memory');
  });

  it('missing runtime version', async () => {
    const functions = { 'pages/index.ts': { runtime: 'haha' } };
    const files = ['pages/index.ts'];
    const { builders, errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(builders).toBe(null);
    expect(errors.length).toBe(1);
    expect(errors[0].code).toBe('invalid_function_runtime');
  });

  it('use a custom runtime', async () => {
    const functions = { 'api/user.php': { runtime: 'now-php@0.0.5' } };
    const files = ['api/user.php'];
    const { builders, errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(errors).toBe(null);
    expect(builders.length).toBe(1);
    expect(builders[0].use).toBe('now-php@0.0.5');
  });

  it('use a custom runtime but without a source', async () => {
    const functions = { 'api/user.php': { runtime: 'now-php@0.0.5' } };
    const files = ['api/team.js'];
    const { errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(errors.length).toBe(1);
    expect(errors[0].code).toBe('invalid_function_source');
  });

  it('do not allow empty functions', async () => {
    const functions = { 'api/user.php': {} };
    const files = ['api/user.php'];
    const { errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(errors.length).toBe(1);
    expect(errors[0].code).toBe('invalid_function');
  });

  it('do not allow null functions', async () => {
    const functions = { 'api/user.php': null };
    const files = ['api/user.php'];
    const { errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(errors.length).toBe(1);
    expect(errors[0].code).toBe('invalid_function');
  });

  it('Do not allow functions that are not used by @now/next', async () => {
    const detected = {
      buildCommand: 'yarn build',
      framework: {
        slug: 'next',
        version: '9.0.0',
      },
    };

    const functions = { 'test.js': { memory: 1024 } };
    const files = ['pages/index.js', 'test.js'];

    const { errors } = await detectBuilders(files, detected, { functions });

    expect(errors).toBeDefined();
    expect(errors[0].code).toBe('unused_function');
  });

  it('Must include includeFiles config property', async () => {
    const functions = {
      'api/test.js': { includeFiles: 'text/include.txt' },
    };
    const files = ['api/test.js'];

    const { builders, errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(errors).toBe(null);
    expect(builders).not.toBe(null);
    expect(builders[0].use).toBe('@now/node');
    expect(builders[0].config).toMatchObject({
      functions,
      zeroConfig: true,
      includeFiles: 'text/include.txt',
    });
  });

  it('Must include excludeFiles config property', async () => {
    const functions = {
      'api/test.js': { excludeFiles: 'text/exclude.txt' },
    };
    const files = ['api/test.js'];

    const { builders, errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(errors).toBe(null);
    expect(builders).not.toBe(null);
    expect(builders[0].use).toBe('@now/node');
    expect(builders[0].config).toMatchObject({
      functions,
      zeroConfig: true,
      excludeFiles: 'text/exclude.txt',
    });
  });

  it('Must include excludeFiles and includeFiles config property', async () => {
    const functions = {
      'api/test.js': {
        excludeFiles: 'text/exclude.txt',
        includeFiles: 'text/include.txt',
      },
    };
    const files = ['api/test.js'];

    const { builders, errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(errors).toBe(null);
    expect(builders).not.toBe(null);
    expect(builders[0].use).toBe('@now/node');
    expect(builders[0].config).toMatchObject({
      functions,
      zeroConfig: true,
      excludeFiles: 'text/exclude.txt',
      includeFiles: 'text/include.txt',
    });
  });

  it('Must fail for includeFiles config property', async () => {
    const functions = {
      'api/test.js': { includeFiles: { test: 1 } },
    };
    const files = ['api/test.js'];

    const { errors } = await detectBuilders(files, null, { functions });

    expect(errors).not.toBe(null);
    expect(errors[0].code).toBe('invalid_function_property');
  });

  it('Must fail for excludeFiles config property', async () => {
    const functions = {
      'api/test.js': { excludeFiles: { test: 1 } },
    };
    const files = ['api/test.js'];

    const { errors } = await detectBuilders(files, null, { functions });

    expect(errors).not.toBe(null);
    expect(errors[0].code).toBe('invalid_function_property');
  });

  it('Must fail when function patterns start with a slash', async () => {
    const functions = {
      '/api/test.js': { memory: 128 },
    };
    const files = ['api/test.js', '/api/test.js'];

    const { errors } = await detectBuilders(files, null, { functions });

    expect(errors).not.toBe(null);
    expect(errors[0].code).toBe('invalid_function_source');
  });

  it('Custom static output directory', async () => {
    const detected = {
      outputDirectory: 'dist',
    };

    const files = ['dist/index.html', 'dist/style.css'];

    const { builders } = await detectBuilders(files, detected);

    expect(builders.length).toBe(1);
    expect(builders[0].src).toBe('dist/**/*');
    expect(builders[0].use).toBe('@now/static');

    const { defaultRoutes } = await detectRoutes(files, builders);

    expect(defaultRoutes.length).toBe(1);
    expect(defaultRoutes[0].src).toBe('/(.*)');
    expect(defaultRoutes[0].dest).toBe('/dist/$1');
  });

  it('Custom static output directory with api', async () => {
    const detected = {
      outputDirectory: 'output',
    };

    const files = ['api/user.ts', 'output/index.html', 'output/style.css'];

    const { builders } = await detectBuilders(files, detected);

    expect(builders.length).toBe(2);
    expect(builders[1].src).toBe('output/**/*');
    expect(builders[1].use).toBe('@now/static');

    const { defaultRoutes } = await detectRoutes(files, builders);

    expect(defaultRoutes.length).toBe(3);
    expect(defaultRoutes[1].status).toBe(404);
    expect(defaultRoutes[2].src).toBe('/(.*)');
    expect(defaultRoutes[2].dest).toBe('/output/$1');
  });

  it('Custom directory for Serverless Functions', async () => {
    const files = ['server/_lib/db.ts', 'server/user.ts', 'server/team.ts'];

    const functions = {
      'server/**/*.ts': {
        memory: 128,
        runtime: '@now/node@1.2.1',
      },
    };

    const { builders } = await detectBuilders(files, null, { functions });

    expect(builders.length).toBe(3);
    expect(builders[0]).toEqual({
      use: '@now/node@1.2.1',
      src: 'server/team.ts',
      config: {
        zeroConfig: true,
        functions: {
          'server/**/*.ts': {
            memory: 128,
            runtime: '@now/node@1.2.1',
          },
        },
      },
    });
    expect(builders[1]).toEqual({
      use: '@now/node@1.2.1',
      src: 'server/user.ts',
      config: {
        zeroConfig: true,
        functions: {
          'server/**/*.ts': {
            memory: 128,
            runtime: '@now/node@1.2.1',
          },
        },
      },
    });
    // This is expected, since only "api + full static" is supported
    // no other directory, so everything else will be deployed
    expect(builders[2].use).toBe('@now/static');

    const { defaultRoutes } = await detectRoutes(files, builders);

    expect(defaultRoutes.length).toBe(3);
    expect(defaultRoutes[0].dest).toBe('/server/team.ts');
    expect(defaultRoutes[0].src).toBe('^/server/(team\\/|team|team\\.ts)$');
    expect(defaultRoutes[1].dest).toBe('/server/user.ts');
    expect(defaultRoutes[1].src).toBe('^/server/(user\\/|user|user\\.ts)$');
    expect(defaultRoutes[2].status).toBe(404);
  });

  it('Custom directory for Serverless Functions + Next.js', async () => {
    const detected = {
      buildCommand: 'yarn build',
      framework: {
        slug: 'next',
        version: '9.0.0',
      },
    };

    const functions = {
      'server/**/*.ts': {
        runtime: '@now/node@1.2.1',
      },
    };

    const files = ['package.json', 'pages/index.ts', 'server/user.ts'];

    const { builders } = await detectBuilders(files, detected, { functions });

    expect(builders.length).toBe(2);
    expect(builders[0]).toEqual({
      use: '@now/node@1.2.1',
      src: 'server/user.ts',
      config: {
        zeroConfig: true,
        functions,
      },
    });
    expect(builders[1]).toEqual({
      use: '@now/next',
      src: 'package.json',
      config: {
        zeroConfig: true,
        buildCommand: 'yarn build',
        framework: {
          slug: 'next',
          version: '9.0.0',
        },
      },
    });

    const { defaultRoutes } = await detectRoutes(files, builders);

    expect(defaultRoutes.length).toBe(2);
    expect(defaultRoutes[0].dest).toBe('/server/user.ts');
    expect(defaultRoutes[0].src).toBe('^/server/(user\\/|user|user\\.ts)$');
    expect(defaultRoutes[1].status).toBe(404);
  });
});

it('Test `detectRoutes` with `featHandleMiss=true`', async () => {
  const featHandleMiss = true;

  const expectedRoutes = [
    { handle: 'miss' },
    {
      src: '/api/(.+)\\.\\w+',
      dest: '/api/$1',
      check: true,
    },
    {
      status: 404,
      src: '/api(/.*)?$',
      continue: true,
    },
  ];

  {
    const files = ['api/user.go', 'api/team.js', 'api/package.json'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(
      files,
      builders,
      featHandleMiss
    );
    expect(defaultRoutes).toStrictEqual(expectedRoutes);
  }

  {
    const files = ['api/user.go', 'api/user.js'];

    const { builders } = await detectBuilders(files);
    const { error } = await detectRoutes(files, builders, featHandleMiss);
    expect(error.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[user].go', 'api/[team]/[id].js'];

    const { builders } = await detectBuilders(files);
    const { error } = await detectRoutes(files, builders, featHandleMiss);
    expect(error.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[team]/[team].js'];

    const { builders } = await detectBuilders(files);
    const { error } = await detectRoutes(files, builders, featHandleMiss);
    expect(error.code).toBe('conflicting_path_segment');
  }

  {
    const files = ['api/date/index.js', 'api/date/index.go'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes, error } = await detectRoutes(
      files,
      builders,
      featHandleMiss
    );
    expect(defaultRoutes).toBe(null);
    expect(error.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[endpoint].js', 'api/[endpoint]/[id].js'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(
      files,
      builders,
      featHandleMiss
    );
    expect(defaultRoutes).toStrictEqual(expectedRoutes);
  }

  {
    const files = [
      'public/index.html',
      'api/[endpoint].js',
      'api/[endpoint]/[id].js',
    ];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(
      files,
      builders,
      featHandleMiss
    );
    expect(defaultRoutes).toStrictEqual(expectedRoutes);
  }

  {
    const detected = {
      buildCommand: 'yarn build',
      framework: {
        slug: 'next',
        version: '9.0.0',
      },
    };

    const files = ['public/index.html', 'api/[endpoint].js'];

    const { builders } = await detectBuilders(files, detected);
    const { defaultRoutes } = await detectRoutes(
      files,
      builders,
      featHandleMiss
    );
    expect(defaultRoutes).toStrictEqual(expectedRoutes);
  }

  {
    const files = ['public/index.html'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(
      files,
      builders,
      featHandleMiss
    );
    expect(defaultRoutes).toStrictEqual([]);
  }

  {
    const files = ['api/date/index.js', 'api/date.js'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(
      files,
      builders,
      featHandleMiss
    );
    expect(defaultRoutes).toStrictEqual(expectedRoutes);
  }

  {
    const files = ['api/date.js', 'api/[date]/index.js'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(
      files,
      builders,
      featHandleMiss
    );
    expect(defaultRoutes).toStrictEqual(expectedRoutes);
  }

  {
    const files = [
      'api/index.ts',
      'api/index.d.ts',
      'api/users/index.ts',
      'api/users/index.d.ts',
      'api/food.ts',
      'api/ts/gold.ts',
    ];
    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(
      files,
      builders,
      featHandleMiss
    );
    expect(defaultRoutes).toStrictEqual(expectedRoutes);
  }

  {
    // use a custom runtime
    const functions = { 'api/user.php': { runtime: 'now-php@0.0.5' } };
    const files = ['api/user.php'];

    const { builders } = await detectBuilders(files, null, { functions });
    const { defaultRoutes } = await detectRoutes(
      files,
      builders,
      featHandleMiss
    );
    expect(defaultRoutes).toStrictEqual(expectedRoutes);
  }
});

it('Test `detectRoutes`', async () => {
  {
    const files = ['api/user.go', 'api/team.js', 'api/package.json'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(files, builders);
    expect(defaultRoutes.length).toBe(3);
    expect(defaultRoutes[0].dest).toBe('/api/team.js');
    expect(defaultRoutes[1].dest).toBe('/api/user.go');
    expect(defaultRoutes[2].dest).not.toBeDefined();
    expect(defaultRoutes[2].status).toBe(404);
  }

  {
    const files = ['api/user.go', 'api/user.js'];

    const { builders } = await detectBuilders(files);
    const { error } = await detectRoutes(files, builders);
    expect(error.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[user].go', 'api/[team]/[id].js'];

    const { builders } = await detectBuilders(files);
    const { error } = await detectRoutes(files, builders);
    expect(error.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[team]/[team].js'];

    const { builders } = await detectBuilders(files);
    const { error } = await detectRoutes(files, builders);
    expect(error.code).toBe('conflicting_path_segment');
  }

  {
    const files = ['api/date/index.js', 'api/date/index.go'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes, error } = await detectRoutes(files, builders);
    expect(defaultRoutes).toBe(null);
    expect(error.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[endpoint].js', 'api/[endpoint]/[id].js'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(files, builders);
    expect(defaultRoutes.length).toBe(3);
  }

  {
    const files = [
      'public/index.html',
      'api/[endpoint].js',
      'api/[endpoint]/[id].js',
    ];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(files, builders);
    expect(defaultRoutes[2].status).toBe(404);
    expect(defaultRoutes[2].src).toBe('/api(/.*)?$');
    expect(defaultRoutes[3].src).toBe('/(.*)');
    expect(defaultRoutes[3].dest).toBe('/public/$1');
    expect(defaultRoutes.length).toBe(4);
  }

  {
    const detected = {
      buildCommand: 'yarn build',
      framework: {
        slug: 'next',
        version: '9.0.0',
      },
    };

    const files = ['public/index.html', 'api/[endpoint].js'];

    const { builders } = await detectBuilders(files, detected);
    const { defaultRoutes } = await detectRoutes(files, builders);
    expect(defaultRoutes[1].status).toBe(404);
    expect(defaultRoutes[1].src).toBe('/api(/.*)?$');
    expect(defaultRoutes.length).toBe(2);
  }

  {
    const files = ['public/index.html'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(files, builders);

    expect(defaultRoutes.length).toBe(1);
  }

  {
    const files = ['api/date/index.js', 'api/date.js'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(files, builders);

    expect(defaultRoutes.length).toBe(3);
    expect(defaultRoutes[0].src).toBe(
      '^/api/date(\\/|\\/index|\\/index\\.js)?$'
    );
    expect(defaultRoutes[0].dest).toBe('/api/date/index.js');
    expect(defaultRoutes[1].src).toBe('^/api/(date\\/|date|date\\.js)$');
    expect(defaultRoutes[1].dest).toBe('/api/date.js');
  }

  {
    const files = ['api/date.js', 'api/[date]/index.js'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(files, builders);

    expect(defaultRoutes.length).toBe(3);
    expect(defaultRoutes[0].src).toBe(
      '^/api/([^\\/]+)(\\/|\\/index|\\/index\\.js)?$'
    );
    expect(defaultRoutes[0].dest).toBe('/api/[date]/index.js?date=$1');
    expect(defaultRoutes[1].src).toBe('^/api/(date\\/|date|date\\.js)$');
    expect(defaultRoutes[1].dest).toBe('/api/date.js');
  }

  {
    const files = [
      'api/index.ts',
      'api/index.d.ts',
      'api/users/index.ts',
      'api/users/index.d.ts',
      'api/food.ts',
      'api/ts/gold.ts',
    ];
    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(files, builders);

    expect(builders.length).toBe(4);
    expect(builders[0].use).toBe('@now/node');
    expect(builders[1].use).toBe('@now/node');
    expect(builders[2].use).toBe('@now/node');
    expect(builders[3].use).toBe('@now/node');
    expect(defaultRoutes.length).toBe(5);
  }

  {
    // use a custom runtime
    const functions = { 'api/user.php': { runtime: 'now-php@0.0.5' } };
    const files = ['api/user.php'];

    const { builders } = await detectBuilders(files, null, { functions });
    const { defaultRoutes } = await detectRoutes(files, builders);

    expect(defaultRoutes.length).toBe(2);
    expect(defaultRoutes[0].dest).toBe('/api/user.php');
  }
});
