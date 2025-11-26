import fs from 'fs-extra';
import { join } from 'path';
import { tmpdir } from 'os';
import { glob, isDirectory, isSymbolicLink } from '../src';
import { describe, expect, it } from 'vitest';

describe('glob()', () => {
  it('should not return entries for empty directories by default', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'build-utils-test'));
    try {
      await Promise.all([
        fs.writeFile(join(dir, 'root.txt'), 'file at the root'),
        fs.mkdirp(join(dir, 'empty-dir')),
        fs
          .mkdirp(join(dir, 'dir-with-file'))
          .then(() =>
            fs.writeFile(join(dir, 'dir-with-file/data.json'), '{"a":"b"}')
          ),
        fs.mkdirp(join(dir, 'another/subdir')),
      ]);
      const files = await glob('**', dir);
      const fileNames = Object.keys(files).sort();
      expect(fileNames).toHaveLength(2);
      expect(fileNames).toEqual(['dir-with-file/data.json', 'root.txt']);
      expect(isDirectory(files['dir-with-file/data.json'].mode)).toEqual(false);
      expect(isDirectory(files['root.txt'].mode)).toEqual(false);
      expect(files['dir-with-file']).toBeUndefined();
      expect(files['another/subdir']).toBeUndefined();
      expect(files['empty-dir']).toBeUndefined();
    } finally {
      await fs.remove(dir);
    }
  });

  it('should return entries for empty directories with `includeDirectories: true`', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'build-utils-test'));
    try {
      await Promise.all([
        fs.writeFile(join(dir, 'root.txt'), 'file at the root'),
        fs.mkdirp(join(dir, 'empty-dir')),
        fs
          .mkdirp(join(dir, 'dir-with-file'))
          .then(() =>
            fs.writeFile(join(dir, 'dir-with-file/data.json'), '{"a":"b"}')
          ),
        fs.mkdirp(join(dir, 'another/subdir')),
      ]);
      const files = await glob('**', { cwd: dir, includeDirectories: true });
      const fileNames = Object.keys(files).sort();
      expect(fileNames).toHaveLength(4);
      expect(fileNames).toEqual([
        'another/subdir',
        'dir-with-file/data.json',
        'empty-dir',
        'root.txt',
      ]);
      expect(isDirectory(files['another/subdir'].mode)).toEqual(true);
      expect(isDirectory(files['empty-dir'].mode)).toEqual(true);
      expect(isDirectory(files['dir-with-file/data.json'].mode)).toEqual(false);
      expect(isDirectory(files['root.txt'].mode)).toEqual(false);
      expect(files['dir-with-file']).toBeUndefined();
    } finally {
      await fs.remove(dir);
    }
  });

  it('should allow for following symlinks', async () => {
    const rootDir = await fs.mkdtemp(join(tmpdir(), 'build-utils-test'));
    const dir = await fs.mkdtemp(join(rootDir, 'build-utils-test'));
    try {
      // Create files and directories first
      await Promise.all([
        fs.writeFile(join(rootDir, 'root.txt'), 'file outside of "dir"'),
        fs.writeFile(join(dir, 'root.txt'), 'file at the root'),
        fs.mkdirp(join(dir, 'empty-dir')),
        fs
          .mkdirp(join(dir, 'dir-with-file'))
          .then(() =>
            fs.writeFile(join(dir, 'dir-with-file/data.json'), '{"a":"b"}')
          ),
        fs.mkdirp(join(dir, 'another/subdir')),
      ]);

      // On Windows, use 'junction' type for directory symlinks to avoid permission issues.
      // Junctions don't require elevated permissions unlike directory symlinks.
      const dirSymlinkType = process.platform === 'win32' ? 'junction' : 'dir';

      await Promise.all([
        // File symlinks (work on all platforms)
        fs.symlink('root.txt', join(dir, 'root-link')),
        fs.symlink(join(dir, 'root.txt'), join(dir, 'abs-root-link')),
        fs.symlink('dir-with-file', join(dir, 'dir-link'), dirSymlinkType),
        fs.symlink('empty-dir', join(dir, 'empty-dir-link'), dirSymlinkType),
        fs.symlink('../root.txt', join(dir, 'outside-cwd-link')),
        fs.symlink(
          join(rootDir, 'root.txt'),
          join(dir, 'abs-outside-cwd-link')
        ),
      ]);

      const files = await glob('**', { cwd: dir, follow: true });
      const fileNames = Object.keys(files).sort();

      // Should only include symlinks pointing within cwd, not outside
      expect(fileNames).toHaveLength(5);
      expect(fileNames).toEqual([
        'abs-root-link',
        'dir-link/data.json',
        'dir-with-file/data.json',
        'root-link',
        'root.txt',
      ]);

      // When following symlinks, the mode should be of the target file, not the symlink
      for (const file of Object.values(files)) {
        expect(isSymbolicLink(file.mode)).toEqual(false);
      }
    } finally {
      await fs.remove(dir);
    }
  });
});
