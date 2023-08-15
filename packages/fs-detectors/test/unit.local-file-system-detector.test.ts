import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { LocalFileSystemDetector, DetectorFilesystem } from '../src';

const tmpdir = path.join(os.tmpdir(), 'local-file-system-test');

const dirs = ['', 'a', `a${path.sep}b`]; // root, single-nested, double-nested
const files = ['foo', 'bar'];
const filePaths = dirs.flatMap(dir => files.map(file => path.join(dir, file)));

const localFileSystem = new LocalFileSystemDetector(tmpdir);

describe('LocalFileSystemDetector', () => {
  beforeAll(async () => {
    await Promise.all(
      dirs.map(dir => fs.mkdir(path.join(tmpdir, dir), { recursive: true }))
    );
    await Promise.all(
      filePaths.map(filePath =>
        fs.writeFile(path.join(tmpdir, filePath), path.basename(filePath))
      )
    );
  });

  afterAll(async () => {
    await fs.rm(tmpdir, { recursive: true, force: true });
  });

  it.skip('should be instance of DetectorFilesystem', () => {
    expect(localFileSystem instanceof DetectorFilesystem).toBe(true);
  });

  it.skip('should call hasPath correctly', async () => {
    const hasPathSpy = jest.spyOn(localFileSystem, '_hasPath');
    const hasPath = await Promise.all(
      filePaths.map(filePath => localFileSystem.hasPath(filePath))
    );
    expect(hasPath.every(v => v)).toBe(true);
    expect(hasPathSpy).toHaveBeenCalledTimes(filePaths.length);
  });

  it.skip('should call readFile correctly', async () => {
    const readFile = await Promise.all(
      filePaths.map(filePath => localFileSystem.readFile(filePath))
    );
    expect(
      readFile.every(buf => {
        const value = buf.toString('utf-8');
        return value === 'foo' || value === 'bar';
      })
    ).toBe(true);
  });

  it.skip('should call isFile correctly', async () => {
    const isFile = await Promise.all(
      filePaths.map(filePath => localFileSystem.isFile(filePath))
    );
    expect(isFile.every(v => v)).toBe(true);
  });

  it.skip('should call readdir correctly', async () => {
    const readdirResults = await Promise.all(
      dirs.map(dir => localFileSystem.readdir(dir))
    );
    const expectedPaths = [...dirs, ...filePaths].sort().slice(1); // drop the first path since its the root
    const actualPaths = readdirResults
      .flatMap(result => result.map(stat => stat.path))
      .sort();
    expect(actualPaths).toEqual(expectedPaths);
  });

  it.skip('should call chdir correctly', async () => {
    const a = localFileSystem.chdir('a');
    expect(a instanceof LocalFileSystemDetector);
    const readdirResult = await a.readdir('');
    expect(readdirResult.map(stat => stat.name).sort()).toEqual([
      'b',
      'bar',
      'foo',
    ]);
  });
});
