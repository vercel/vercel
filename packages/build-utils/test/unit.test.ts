import ms from 'ms';
import path from 'path';
import fs from 'fs-extra';
import { strict as assert } from 'assert';
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
} from '../src';

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

it('should re-create symlinks properly', async () => {
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
});

it('should create zip files with symlinks properly', async () => {
  if (process.platform === 'win32') {
    console.log('Skipping test on windows');
    return;
  }
  const files = await glob('**', path.join(__dirname, 'symlinks'));
  assert.equal(Object.keys(files).length, 4);

  const outFile = path.join(__dirname, 'symlinks.zip');
  await fs.remove(outFile);

  const outDir = path.join(__dirname, 'symlinks-out');
  await fs.remove(outDir);
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

  const autoMessage =
    'Please set Node.js Version to 14.x in your Project Settings to use Node.js 14.';
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

  const foundMessage =
    'Please set "engines": { "node": "14.x" } in your `package.json` file to use Node.js 14.';
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
  expect(await getSupportedNodeVersion('>=10')).toHaveProperty('major', 14);
  expect(await getSupportedNodeVersion('>=10.3.0')).toHaveProperty('major', 14);
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
    await getNodeVersion('/tmp', undefined, { nodeVersion: '14.x' }, {})
  ).toHaveProperty('range', '14.x');
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

it('should not warn when package.json engines matches project setting from config', async () => {
  expect(
    await getNodeVersion(
      path.join(__dirname, 'pkg-engine-node'),
      undefined,
      { nodeVersion: '14.x' },
      {}
    )
  ).toHaveProperty('range', '14.x');
  expect(warningMessages).toStrictEqual([]);
});

it('should get latest node version', async () => {
  expect(getLatestNodeVersion()).toHaveProperty('major', 14);
});

it('should throw for discontinued versions', async () => {
  // Mock a future date so that Node 8 and 10 become discontinued
  const realDateNow = Date.now.bind(global.Date);
  global.Date.now = () => new Date('2021-05-01').getTime();

  expect(getSupportedNodeVersion('8.10.x', false)).rejects.toThrow();
  expect(getSupportedNodeVersion('8.10.x', true)).rejects.toThrow();
  expect(getSupportedNodeVersion('10.x', false)).rejects.toThrow();
  expect(getSupportedNodeVersion('10.x', true)).rejects.toThrow();

  const discontinued = getDiscontinuedNodeVersions();
  expect(discontinued.length).toBe(2);
  expect(discontinued[0]).toHaveProperty('range', '10.x');
  expect(discontinued[1]).toHaveProperty('range', '8.10.x');

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
  expect(warningMessages).toStrictEqual([
    'Error: Node.js version 10.x is deprecated. Deployments created on or after 2021-04-20 will fail to build. Please set "engines": { "node": "14.x" } in your `package.json` file to use Node.js 14. This change is the result of a decision made by an upstream infrastructure provider (AWS).',
    'Error: Node.js version 10.x is deprecated. Deployments created on or after 2021-04-20 will fail to build. Please set Node.js Version to 14.x in your Project Settings to use Node.js 14. This change is the result of a decision made by an upstream infrastructure provider (AWS).',
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
});

it('should not return lockfileVersion with yarn', async () => {
  const fixture = path.join(__dirname, 'fixtures', '19-yarn-v2');
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('yarn');
  expect(result.lockfileVersion).toEqual(undefined);
});

it('should return lockfileVersion 1 with older versions of npm', async () => {
  const fixture = path.join(__dirname, 'fixtures', '08-yarn-npm/with-npm');
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('npm');
  expect(result.lockfileVersion).toEqual(1);
});

it('should detect npm Workspaces', async () => {
  const fixture = path.join(__dirname, 'fixtures', '21-npm-workspaces/a');
  const result = await scanParentDirs(fixture);
  expect(result.cliType).toEqual('npm');
  expect(result.lockfileVersion).toEqual(2);
});
