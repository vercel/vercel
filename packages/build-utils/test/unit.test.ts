import ms from 'ms';
import path from 'path';
import fs, { readlink } from 'fs-extra';
import retry from 'async-retry';
import { strict as assert, strictEqual } from 'assert';
import { createZip } from '../src/lambda';
import { getSupportedNodeVersion } from '../src/fs/node-version';
import download from '../src/fs/download';
import {
  glob,
  spawnAsync,
  getNodeVersion,
  getLatestNodeVersion,
  getDiscontinuedNodeVersions,
  runNpmInstall,
  runPackageJsonScript,
  scanParentDirs,
  FileBlob,
  Meta,
} from '../src';

jest.setTimeout(10 * 1000);

async function expectBuilderError(promise: Promise<any>, pattern: string) {
  let result;
  try {
    result = await promise;
  } catch (error) {
    result = error;
  }
  assert('message' in result, `Expected error message but found ${result}`);
  assert(
    typeof result.message === 'string',
    `Expected error to be a string but found ${typeof result.message}`
  );
  assert(
    result.message.includes(pattern),
    `Expected ${pattern} but found "${result.message}"`
  );
}

let warningMessages: string[];
const originalConsoleWarn = console.warn;
beforeEach(() => {
  warningMessages = [];
  console.warn = m => {
    warningMessages.push(m);
  };
});

afterEach(() => {
  console.warn = originalConsoleWarn;
});

it('should re-create FileFsRef symlinks properly', async () => {
  if (process.platform === 'win32') {
    console.log('Skipping test on windows');
    return;
  }
  const files = await glob('**', path.join(__dirname, 'symlinks'));
  assert.equal(Object.keys(files).length, 4);

  const outDir = path.join(__dirname, 'symlinks-out');
  await fs.remove(outDir);

  const files2 = await download(files, outDir);
  assert.equal(Object.keys(files2).length, 4);

  const [linkStat, linkDirStat, aStat] = await Promise.all([
    fs.lstat(path.join(outDir, 'link.txt')),
    fs.lstat(path.join(outDir, 'link-dir')),
    fs.lstat(path.join(outDir, 'a.txt')),
  ]);
  assert(linkStat.isSymbolicLink());
  assert(linkDirStat.isSymbolicLink());
  assert(aStat.isFile());

  const [linkDirContents, linkTextContents] = await Promise.all([
    readlink(path.join(outDir, 'link-dir')),
    readlink(path.join(outDir, 'link.txt')),
  ]);

  strictEqual(linkDirContents, 'dir');
  strictEqual(linkTextContents, './a.txt');
});

it('should re-create FileBlob symlinks properly', async () => {
  if (process.platform === 'win32') {
    console.log('Skipping test on windows');
    return;
  }

  const files = {
    'a.txt': new FileBlob({
      mode: 33188,
      contentType: undefined,
      data: 'a text',
    }),
    'dir/b.txt': new FileBlob({
      mode: 33188,
      contentType: undefined,
      data: 'b text',
    }),
    'link-dir': new FileBlob({
      mode: 41453,
      contentType: undefined,
      data: 'dir',
    }),
    'link.txt': new FileBlob({
      mode: 41453,
      contentType: undefined,
      data: 'a.txt',
    }),
  };

  strictEqual(Object.keys(files).length, 4);

  const outDir = path.join(__dirname, 'symlinks-out');
  await fs.remove(outDir);

  const files2 = await download(files, outDir);
  strictEqual(Object.keys(files2).length, 4);

  const [linkStat, linkDirStat, aStat, dirStat] = await Promise.all([
    fs.lstat(path.join(outDir, 'link.txt')),
    fs.lstat(path.join(outDir, 'link-dir')),
    fs.lstat(path.join(outDir, 'a.txt')),
    fs.lstat(path.join(outDir, 'dir')),
  ]);

  assert(linkStat.isSymbolicLink());
  assert(linkDirStat.isSymbolicLink());
  assert(aStat.isFile());
  assert(dirStat.isDirectory());

  const [linkDirContents, linkTextContents] = await Promise.all([
    readlink(path.join(outDir, 'link-dir')),
    readlink(path.join(outDir, 'link.txt')),
  ]);

  strictEqual(linkDirContents, 'dir');
  strictEqual(linkTextContents, 'a.txt');
});

it('should create zip files with symlinks properly', async () => {
  if (process.platform === 'win32') {
    console.log('Skipping test on windows');
    return;
  }
  const outDir = path.join(__dirname, 'symlinks-out');
  const outFile = path.join(__dirname, 'symlinks.zip');
  try {
    const files = await glob('**', path.join(__dirname, 'symlinks'));
    assert.equal(Object.keys(files).length, 4);

    await fs.mkdirp(outDir);
    await fs.writeFile(outFile, await createZip(files));
    await spawnAsync('unzip', [outFile], { cwd: outDir });

    const [linkStat, linkDirStat, aStat] = await Promise.all([
      fs.lstat(path.join(outDir, 'link.txt')),
      fs.lstat(path.join(outDir, 'link-dir')),
      fs.lstat(path.join(outDir, 'a.txt')),
    ]);
    assert(linkStat.isSymbolicLink());
    assert(linkDirStat.isSymbolicLink());
    assert(aStat.isFile());
  } finally {
    await fs.remove(outFile);
    await fs.remove(outDir);
  }
});

it('should create zip files with empty directories', async () => {
  if (process.platform === 'win32') {
    console.log('Skipping test on windows');
    return;
  }

  const outDir = path.join(__dirname, 'out');
  const outFile = path.join(__dirname, 'out.zip');
  try {
    const files = {
      dir: new FileBlob({
        mode: 16877,
        data: Buffer.alloc(0),
      }),
      file: new FileBlob({
        mode: 33188,
        data: 'contents',
      }),
    };

    await fs.mkdirp(outDir);
    await fs.writeFile(outFile, await createZip(files));
    await spawnAsync('unzip', [outFile], { cwd: outDir });

    const [dirStat, fileStat] = await Promise.all([
      fs.lstat(path.join(outDir, 'dir')),
      fs.lstat(path.join(outDir, 'file')),
    ]);
    assert(dirStat.isDirectory());
    assert(fileStat.isFile());

    // Dir is empty
    expect(await fs.readdir(path.join(outDir, 'dir'))).toEqual([]);
  } finally {
    await fs.remove(outFile);
    await fs.remove(outDir);
  }
});

it('should download symlinks even with incorrect file', async () => {
  if (process.platform === 'win32') {
    console.log('Skipping test on windows');
    return;
  }
  const files = {
    'dir/file.txt': new FileBlob({
      mode: 33188,
      contentType: undefined,
      data: 'file text',
    }),
    linkdir: new FileBlob({
      mode: 41453,
      contentType: undefined,
      data: 'dir',
    }),
    'linkdir/file.txt': new FileBlob({
      mode: 33188,
      contentType: undefined,
      data: 'this file should be discarded',
    }),
  };

  const outDir = path.join(__dirname, 'symlinks-out');
  try {
    await fs.mkdirp(outDir);
    await download(files, outDir);

    const [dir, file, linkdir] = await Promise.all([
      fs.lstat(path.join(outDir, 'dir')),
      fs.lstat(path.join(outDir, 'dir/file.txt')),
      fs.lstat(path.join(outDir, 'linkdir')),
    ]);
    expect(dir.isFile()).toBe(false);
    expect(dir.isSymbolicLink()).toBe(false);

    expect(file.isFile()).toBe(true);
    expect(file.isSymbolicLink()).toBe(false);

    expect(linkdir.isSymbolicLink()).toBe(true);

    expect(warningMessages).toEqual([
      'Warning: file "linkdir/file.txt" is within a symlinked directory "linkdir" and will be ignored',
    ]);
  } finally {
    await fs.remove(outDir);
  }
});

it('should only match supported node versions, otherwise throw an error', async () => {
  expect(await getSupportedNodeVersion('12.x', false)).toHaveProperty(
    'major',
    12
  );
  expect(await getSupportedNodeVersion('14.x', false)).toHaveProperty(
    'major',
    14
  );
  expect(await getSupportedNodeVersion('16.x', false)).toHaveProperty(
    'major',
    16
  );

  const autoMessage =
    'Please set Node.js Version to 16.x in your Project Settings to use Node.js 16.';
  await expectBuilderError(
    getSupportedNodeVersion('8.11.x', true),
    autoMessage
  );
  await expectBuilderError(getSupportedNodeVersion('6.x', true), autoMessage);
  await expectBuilderError(getSupportedNodeVersion('999.x', true), autoMessage);
  await expectBuilderError(getSupportedNodeVersion('foo', true), autoMessage);
  await expectBuilderError(getSupportedNodeVersion('=> 10', true), autoMessage);

  expect(await getSupportedNodeVersion('12.x', true)).toHaveProperty(
    'major',
    12
  );
  expect(await getSupportedNodeVersion('14.x', true)).toHaveProperty(
    'major',
    14
  );
  expect(await getSupportedNodeVersion('16.x', true)).toHaveProperty(
    'major',
    16
  );

  const foundMessage =
    'Please set "engines": { "node": "16.x" } in your `package.json` file to use Node.js 16.';
  await expectBuilderError(
    getSupportedNodeVersion('8.11.x', false),
    foundMessage
  );
  await expectBuilderError(getSupportedNodeVersion('6.x', false), foundMessage);
  await expectBuilderError(
    getSupportedNodeVersion('999.x', false),
    foundMessage
  );
  await expectBuilderError(getSupportedNodeVersion('foo', false), foundMessage);
  await expectBuilderError(
    getSupportedNodeVersion('=> 10', false),
    foundMessage
  );
});

it('should match all semver ranges', async () => {
  // See https://docs.npmjs.com/files/package.json#engines
  expect(await getSupportedNodeVersion('12.0.0')).toHaveProperty('major', 12);
  expect(await getSupportedNodeVersion('12.x')).toHaveProperty('major', 12);
  expect(await getSupportedNodeVersion('>=10')).toHaveProperty('major', 16);
  expect(await getSupportedNodeVersion('>=10.3.0')).toHaveProperty('major', 16);
  expect(await getSupportedNodeVersion('11.5.0 - 12.5.0')).toHaveProperty(
    'major',
    12
  );
  expect(await getSupportedNodeVersion('>=9.5.0 <=12.5.0')).toHaveProperty(
    'major',
    12
  );
  expect(await getSupportedNodeVersion('~12.5.0')).toHaveProperty('major', 12);
  expect(await getSupportedNodeVersion('^12.5.0')).toHaveProperty('major', 12);
  expect(await getSupportedNodeVersion('12.5.0 - 14.5.0')).toHaveProperty(
    'major',
    14
  );
});

it('should ignore node version in vercel dev getNodeVersion()', async () => {
  expect(
    await getNodeVersion(
      '/tmp',
      undefined,
      { nodeVersion: '1' },
      { isDev: true }
    )
  ).toHaveProperty('runtime', 'nodejs');
});

it('should select project setting from config when no package.json is found', async () => {
  expect(
    await getNodeVersion('/tmp', undefined, { nodeVersion: '16.x' }, {})
  ).toHaveProperty('range', '16.x');
  expect(warningMessages).toStrictEqual([]);
});

it('should prefer package.json engines over project setting from config and warn', async () => {
  expect(
    await getNodeVersion(
      path.join(__dirname, 'pkg-engine-node'),
      undefined,
      { nodeVersion: '12.x' },
      {}
    )
  ).toHaveProperty('range', '14.x');
  expect(warningMessages).toStrictEqual([
    'Warning: Due to "engines": { "node": "14.x" } in your `package.json` file, the Node.js Version defined in your Project Settings ("12.x") will not apply. Learn More: http://vercel.link/node-version',
  ]);
});

it('should warn when package.json engines is exact version', async () => {
  expect(
    await getNodeVersion(
      path.join(__dirname, 'pkg-engine-node-exact'),
      undefined,
      {},
      {}
    )
  ).toHaveProperty('range', '16.x');
  expect(warningMessages).toStrictEqual([
    'Warning: Detected "engines": { "node": "16.14.0" } in your `package.json` with major.minor.patch, but only major Node.js Version can be selected. Learn More: http://vercel.link/node-version',
  ]);
});

it('should warn when package.json engines is greater than', async () => {
  expect(
    await getNodeVersion(
      path.join(__dirname, 'pkg-engine-node-greaterthan'),
      undefined,
      {},
      {}
    )
  ).toHaveProperty('range', '16.x');
  expect(warningMessages).toStrictEqual([
    'Warning: Detected "engines": { "node": ">=16" } in your `package.json` that will automatically upgrade when a new major Node.js Version is released. Learn More: http://vercel.link/node-version',
  ]);
});

it('should not warn when package.json engines matches project setting from config', async () => {
  expect(
    await getNodeVersion(
      path.join(__dirname, 'pkg-engine-node'),
      undefined,
      { nodeVersion: '14' },
      {}
    )
  ).toHaveProperty('range', '14.x');
  expect(warningMessages).toStrictEqual([]);

  expect(
    await getNodeVersion(
      path.join(__dirname, 'pkg-engine-node'),
      undefined,
      { nodeVersion: '14.x' },
      {}
    )
  ).toHaveProperty('range', '14.x');
  expect(warningMessages).toStrictEqual([]);

  expect(
    await getNodeVersion(
      path.join(__dirname, 'pkg-engine-node'),
      undefined,
      { nodeVersion: '<15' },
      {}
    )
  ).toHaveProperty('range', '14.x');
  expect(warningMessages).toStrictEqual([]);
});

it('should get latest node version', async () => {
  expect(getLatestNodeVersion()).toHaveProperty('major', 16);
});

it('should throw for discontinued versions', async () => {
  // Mock a future date so that Node 8 and 10 become discontinued
  const realDateNow = Date.now.bind(global.Date);
  global.Date.now = () => new Date('2022-10-15').getTime();

  expect(getSupportedNodeVersion('8.10.x', false)).rejects.toThrow();
  expect(getSupportedNodeVersion('8.10.x', true)).rejects.toThrow();
  expect(getSupportedNodeVersion('10.x', false)).rejects.toThrow();
  expect(getSupportedNodeVersion('10.x', true)).rejects.toThrow();
  expect(getSupportedNodeVersion('12.x', false)).rejects.toThrow();
  expect(getSupportedNodeVersion('12.x', true)).rejects.toThrow();

  const discontinued = getDiscontinuedNodeVersions();
  expect(discontinued.length).toBe(3);
  expect(discontinued[0]).toHaveProperty('range', '12.x');
  expect(discontinued[1]).toHaveProperty('range', '10.x');
  expect(discontinued[2]).toHaveProperty('range', '8.10.x');

  global.Date.now = realDateNow;
});

it('should warn for deprecated versions, soon to be discontinued', async () => {
  // Mock a future date so that Node 10 warns
  const realDateNow = Date.now.bind(global.Date);
  global.Date.now = () => new Date('2021-02-23').getTime();

  expect(await getSupportedNodeVersion('10.x', false)).toHaveProperty(
    'major',
    10
  );
  expect(await getSupportedNodeVersion('10.x', true)).toHaveProperty(
    'major',
    10
  );
  expect(await getSupportedNodeVersion('12.x', false)).toHaveProperty(
    'major',
    12
  );
  expect(await getSupportedNodeVersion('12.x', true)).toHaveProperty(
    'major',
    12
  );
  expect(warningMessages).toStrictEqual([
    'Error: Node.js version 10.x has reached End-of-Life. Deployments created on or after 2021-04-20 will fail to build. Please set "engines": { "node": "16.x" } in your `package.json` file to use Node.js 16.',
    'Error: Node.js version 10.x has reached End-of-Life. Deployments created on or after 2021-04-20 will fail to build. Please set Node.js Version to 16.x in your Project Settings to use Node.js 16.',
    'Error: Node.js version 12.x has reached End-of-Life. Deployments created on or after 2022-10-01 will fail to build. Please set "engines": { "node": "16.x" } in your `package.json` file to use Node.js 16.',
    'Error: Node.js version 12.x has reached End-of-Life. Deployments created on or after 2022-10-01 will fail to build. Please set Node.js Version to 16.x in your Project Settings to use Node.js 16.',
  ]);

  global.Date.now = realDateNow;
});

it('should support require by path for legacy builders', () => {
  const index = require('@vercel/build-utils');

  const download2 = require('@vercel/build-utils/fs/download.js');
  const getWriteableDirectory2 = require('@vercel/build-utils/fs/get-writable-directory.js');
  const glob2 = require('@vercel/build-utils/fs/glob.js');
  const rename2 = require('@vercel/build-utils/fs/rename.js');
  const {
    runNpmInstall: runNpmInstall2,
  } = require('@vercel/build-utils/fs/run-user-scripts.js');
  const streamToBuffer2 = require('@vercel/build-utils/fs/stream-to-buffer.js');

  const FileBlob2 = require('@vercel/build-utils/file-blob.js');
  const FileFsRef2 = require('@vercel/build-utils/file-fs-ref.js');
  const FileRef2 = require('@vercel/build-utils/file-ref.js');
  const { Lambda: Lambda2 } = require('@vercel/build-utils/lambda.js');

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

it(
  'should have correct $PATH when running `runPackageJsonScript()` with yarn',
  async () => {
    if (process.platform === 'win32') {
      console.log('Skipping test on windows');
      return;
    }
    if (process.platform === 'darwin') {
      console.log('Skipping test on macOS');
      return;
    }
    const fixture = path.join(__dirname, 'fixtures', '19-yarn-v2');
    await runNpmInstall(fixture);
    await runPackageJsonScript(fixture, 'env');

    // `yarn` was failing with ENOENT before, so as long as the
    // script was invoked at all is enough to verify the fix
    const out = await fs.readFile(path.join(fixture, 'env.txt'), 'utf8');
    expect(out.trim()).toBeTruthy();
  },
  ms('1m')
);

it('should return lockfileVersion 2 with npm7', async () => {
  const fixture = path.join(__dirname, 'fixtures', '20-npm-7');
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('npm');
  expect(result.lockfileVersion).toEqual(2);
  expect(result.lockfilePath).toEqual(path.join(fixture, 'package-lock.json'));
  expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
});

it('should not return lockfileVersion with yarn', async () => {
  const fixture = path.join(__dirname, 'fixtures', '19-yarn-v2');
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('yarn');
  expect(result.lockfileVersion).toEqual(undefined);
  expect(result.lockfilePath).toEqual(path.join(fixture, 'yarn.lock'));
  expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
});

it('should return lockfileVersion 1 with older versions of npm', async () => {
  const fixture = path.join(__dirname, 'fixtures', '08-yarn-npm/with-npm');
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('npm');
  expect(result.lockfileVersion).toEqual(1);
  expect(result.lockfilePath).toEqual(path.join(fixture, 'package-lock.json'));
  expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
});

it('should detect npm Workspaces', async () => {
  const fixture = path.join(__dirname, 'fixtures', '21-npm-workspaces/a');
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('npm');
  expect(result.lockfileVersion).toEqual(2);
  expect(result.lockfilePath).toEqual(
    path.join(fixture, '..', 'package-lock.json')
  );
  expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
});

it('should detect pnpm without workspace', async () => {
  const fixture = path.join(__dirname, 'fixtures', '22-pnpm');
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('pnpm');
  expect(result.lockfileVersion).toEqual(5.3);
  expect(result.lockfilePath).toEqual(path.join(fixture, 'pnpm-lock.yaml'));
  expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
});

it('should detect pnpm with workspaces', async () => {
  const fixture = path.join(__dirname, 'fixtures', '23-pnpm-workspaces/c');
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('pnpm');
  expect(result.lockfileVersion).toEqual(5.3);
  expect(result.lockfilePath).toEqual(
    path.join(fixture, '..', 'pnpm-lock.yaml')
  );
  expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
});

it('should detect package.json in nested backend', async () => {
  const fixture = path.join(
    __dirname,
    '../../node/test/fixtures/18.1-nested-packagejson/backend'
  );
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('yarn');
  expect(result.lockfileVersion).toEqual(undefined);
  // There is no lockfile but this test will pick up vercel/vercel/yarn.lock
  expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
});

it('should detect package.json in nested frontend', async () => {
  const fixture = path.join(
    __dirname,
    '../../node/test/fixtures/18.1-nested-packagejson/frontend'
  );
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('yarn');
  expect(result.lockfileVersion).toEqual(undefined);
  // There is no lockfile but this test will pick up vercel/vercel/yarn.lock
  expect(result.packageJsonPath).toEqual(path.join(fixture, 'package.json'));
});

it('should only invoke `runNpmInstall()` once per `package.json` file (serial)', async () => {
  const meta: Meta = {};
  const fixture = path.join(__dirname, 'fixtures', '02-zero-config-api');
  const apiDir = path.join(fixture, 'api');
  const retryOpts = { maxRetryTime: 1000 };
  let run1, run2, run3;
  await retry(async () => {
    run1 = await runNpmInstall(apiDir, [], undefined, meta);
    expect(run1).toEqual(true);
    expect(
      (meta.runNpmInstallSet as Set<string>).has(
        path.join(fixture, 'package.json')
      )
    ).toEqual(true);
  }, retryOpts);
  await retry(async () => {
    run2 = await runNpmInstall(apiDir, [], undefined, meta);
    expect(run2).toEqual(false);
  }, retryOpts);
  await retry(async () => {
    run3 = await runNpmInstall(fixture, [], undefined, meta);
    expect(run3).toEqual(false);
  }, retryOpts);
});

it('should only invoke `runNpmInstall()` once per `package.json` file (parallel)', async () => {
  const meta: Meta = {};
  const fixture = path.join(__dirname, 'fixtures', '02-zero-config-api');
  const apiDir = path.join(fixture, 'api');
  let results: [boolean, boolean, boolean] | undefined;
  await retry(
    async () => {
      results = await Promise.all([
        runNpmInstall(apiDir, [], undefined, meta),
        runNpmInstall(apiDir, [], undefined, meta),
        runNpmInstall(fixture, [], undefined, meta),
      ]);
    },
    { maxRetryTime: 3000 }
  );
  const [run1, run2, run3] = results || [];
  expect(run1).toEqual(true);
  expect(run2).toEqual(false);
  expect(run3).toEqual(false);
  expect(
    (meta.runNpmInstallSet as Set<string>).has(
      path.join(fixture, 'package.json')
    )
  ).toEqual(true);
});
