import path from 'path';
import fs from 'fs-extra';
import { strict as assert, strictEqual } from 'assert';
import { download, glob, FileBlob } from '../src';

describe('download()', () => {
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
      fs.readlink(path.join(outDir, 'link-dir')),
      fs.readlink(path.join(outDir, 'link.txt')),
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
      fs.readlink(path.join(outDir, 'link-dir')),
      fs.readlink(path.join(outDir, 'link.txt')),
    ]);

    strictEqual(linkDirContents, 'dir');
    strictEqual(linkTextContents, 'a.txt');
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
    await fs.remove(outDir);
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
  });

  it('should create empty directory entries', async () => {
    const outDir = path.join(__dirname, 'symlinks-out');
    await fs.remove(outDir);
    const files = {
      'empty-dir': new FileBlob({
        mode: 16877, // drwxr-xr-x
        contentType: undefined,
        data: '',
      }),
      dir: new FileBlob({
        mode: 16877,
        contentType: undefined,
        data: '',
      }),
      'dir/subdir': new FileBlob({
        mode: 16877,
        contentType: undefined,
        data: '',
      }),
      'another/subdir': new FileBlob({
        mode: 16895, // drwxrwxrwx
        contentType: undefined,
        data: '',
      }),
    };

    await download(files, outDir);

    for (const [p, f] of Object.entries(files)) {
      const stat = await fs.lstat(path.join(outDir, p));
      expect(stat.isDirectory()).toEqual(true);

      if (process.platform !== 'win32') {
        // Don't test Windows since it doesn't support the same permissions
        expect(stat.mode).toEqual(f.mode);
      }
    }
  });
});
