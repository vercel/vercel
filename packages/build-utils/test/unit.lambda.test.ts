import path from 'path';
import { tmpdir } from 'os';
import fs from 'fs-extra';
import { createZip } from '../src/lambda';
import { FileBlob, glob, spawnAsync } from '../src';
import { describe, expect, it } from 'vitest';

const MODE_DIRECTORY = 16877; /* drwxr-xr-x */
const MODE_FILE = 33188; /* -rw-r--r-- */

describe('Lambda', () => {
  it("should error if symbolic link target doesn't exist", async () => {
    if (process.platform === 'win32') {
      console.log('Skipping test on windows');
      return;
    }

    // Create a broken symlink
    await fs.symlink(
      path.join(__dirname, 'symlinks-broken', 'does-not-exist.txt'),
      path.join(__dirname, 'symlinks-broken', 'link-to-does-not-exist.txt')
    );
    const files = await glob('**', path.join(__dirname, 'symlinks-broken'));
    const linkStat = await fs.lstat(
      path.join(__dirname, 'symlinks-broken', 'link-to-does-not-exist.txt')
    );
    expect(linkStat.isSymbolicLink()).toEqual(true);

    await expect(createZip(files)).rejects.toThrow();

    // Cleanup
    await fs.unlink(
      path.join(__dirname, 'symlinks-broken', 'link-to-does-not-exist.txt')
    );
  });
  it('should create zip file with symlinks', async () => {
    if (process.platform === 'win32') {
      console.log('Skipping test on windows');
      return;
    }
    const files = await glob('**', path.join(__dirname, 'symlinks'));
    expect(Object.keys(files)).toHaveLength(4);

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
    expect(linkStat.isSymbolicLink()).toEqual(true);
    expect(linkDirStat.isSymbolicLink()).toEqual(true);
    expect(aStat.isFile()).toEqual(true);
  });

  it('should create zip file with empty directory', async () => {
    if (process.platform === 'win32') {
      console.log('Skipping test on windows');
      return;
    }

    const dir = await fs.mkdtemp(path.join(tmpdir(), 'create-zip-empty-dir'));
    try {
      const files = {
        a: new FileBlob({
          data: 'contents',
          mode: MODE_FILE,
        }),
        empty: new FileBlob({
          data: '',
          mode: MODE_DIRECTORY,
        }),
        'b/a': new FileBlob({
          data: 'inside dir b',
          mode: MODE_FILE,
        }),
        c: new FileBlob({
          data: '',
          mode: MODE_DIRECTORY,
        }),
        'c/a': new FileBlob({
          data: 'inside dir c',
          mode: MODE_FILE,
        }),
      };

      const outFile = path.join(dir, 'lambda.zip');

      const outDir = path.join(dir, 'out');
      await fs.mkdirp(outDir);

      await fs.writeFile(outFile, await createZip(files));
      await spawnAsync('unzip', [outFile], { cwd: outDir });

      expect(fs.statSync(path.join(outDir, 'empty')).isDirectory()).toEqual(
        true
      );
      expect(fs.statSync(path.join(outDir, 'b')).isDirectory()).toEqual(true);
      expect(fs.statSync(path.join(outDir, 'c')).isDirectory()).toEqual(true);
      expect(fs.readFileSync(path.join(outDir, 'a'), 'utf8')).toEqual(
        'contents'
      );
      expect(fs.readFileSync(path.join(outDir, 'b/a'), 'utf8')).toEqual(
        'inside dir b'
      );
      expect(fs.readFileSync(path.join(outDir, 'c/a'), 'utf8')).toEqual(
        'inside dir c'
      );
      expect(fs.readdirSync(path.join(outDir, 'empty'))).toHaveLength(0);
    } finally {
      await fs.remove(dir);
    }
  });
});
