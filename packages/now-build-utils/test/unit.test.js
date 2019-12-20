const path = require('path');
const fs = require('fs-extra');
const assert = require('assert');
const { createZip } = require('../dist/lambda');
const { glob, spawnAsync, download } = require('../');
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
