import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs, { readlink } from 'fs-extra';
import { strict as assert, strictEqual } from 'assert';
import { download, glob, FileBlob } from '../src';

// File mode constants (octal) used by FileBlob to indicate file type
const S_IFREG = 33188; // 0o100644 - regular file
const S_IFLNK = 41453; // 0o120755 - symbolic link (data = link target path)

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

  it('should not fail when symlink already exists with same target', async () => {
    if (process.platform === 'win32') {
      console.log('Skipping test on windows');
      return;
    }

    const files = {
      'a.txt': new FileBlob({
        mode: S_IFREG,
        contentType: undefined,
        data: 'a text',
      }),
      'link.txt': new FileBlob({
        mode: S_IFLNK,
        contentType: undefined,
        data: 'a.txt', // symlink target
      }),
    };

    const outDir = path.join(__dirname, 'symlinks-out');
    await fs.remove(outDir);

    // Download once - creates the symlink
    await download(files, outDir);

    // Download again to the same directory - should not fail with EEXIST
    await download(files, outDir);

    const linkStat = await fs.lstat(path.join(outDir, 'link.txt'));
    assert(linkStat.isSymbolicLink());

    const linkTarget = await readlink(path.join(outDir, 'link.txt'));
    strictEqual(linkTarget, 'a.txt');
  });

  it('should replace symlink when target differs', async () => {
    if (process.platform === 'win32') {
      console.log('Skipping test on windows');
      return;
    }

    const outDir = path.join(__dirname, 'symlinks-out');
    await fs.remove(outDir);

    const files1 = {
      'a.txt': new FileBlob({
        mode: S_IFREG,
        contentType: undefined,
        data: 'a text',
      }),
      'b.txt': new FileBlob({
        mode: S_IFREG,
        contentType: undefined,
        data: 'b text',
      }),
      'link.txt': new FileBlob({
        mode: S_IFLNK,
        contentType: undefined,
        data: 'a.txt', // symlink target
      }),
    };

    // Download with link pointing to a.txt
    await download(files1, outDir);

    const files2 = {
      'a.txt': new FileBlob({
        mode: S_IFREG,
        contentType: undefined,
        data: 'a text',
      }),
      'b.txt': new FileBlob({
        mode: S_IFREG,
        contentType: undefined,
        data: 'b text',
      }),
      'link.txt': new FileBlob({
        mode: S_IFLNK,
        contentType: undefined,
        data: 'b.txt', // symlink target changed
      }),
    };

    // Download again with link pointing to b.txt - should replace
    await download(files2, outDir);

    const linkTarget = await readlink(path.join(outDir, 'link.txt'));
    strictEqual(linkTarget, 'b.txt');
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
