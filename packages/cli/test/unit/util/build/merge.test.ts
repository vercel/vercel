import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, readdir, mkdirp, stat, remove, readFile } from 'fs-extra';
import { merge } from '../../../../src/util/build/merge';
import { isErrnoException } from '@vercel/error-utils';

describe('merge()', () => {
  it('should move source to non-existent destination', async () => {
    const source = join(tmpdir(), 'src');
    const dest = join(tmpdir(), 'dest');
    try {
      await mkdirp(source);
      await writeFile(join(source, 'a.txt'), 'a');
      await merge(source, dest);
      const destContents = await readdir(dest);
      expect(destContents.sort()).toEqual(['a.txt']);
      const sourceStat: Error = await stat(source).then(
        () => {},
        err => err
      );
      expect(isErrnoException(sourceStat) && sourceStat.code).toEqual('ENOENT');
    } finally {
      await Promise.all([source, dest].map(p => remove(p)));
    }
  });

  it('should merge source into existing destination', async () => {
    const source = join(tmpdir(), 'src');
    const dest = join(tmpdir(), 'dest');
    try {
      await mkdirp(source);
      await mkdirp(dest);
      await writeFile(join(source, 'a.txt'), 'a');
      await writeFile(join(source, 'c.txt'), 'c');
      await writeFile(join(dest, 'b.txt'), 'b');
      await writeFile(join(dest, 'c.txt'), 'original');
      await merge(source, dest);
      const destContents = await readdir(dest);
      expect(destContents.sort()).toEqual(['a.txt', 'b.txt', 'c.txt']);
      const sourceStat: Error = await stat(source).then(
        () => {},
        err => err
      );
      expect(isErrnoException(sourceStat) && sourceStat.code).toEqual('ENOENT');
      expect(await readFile(join(dest, 'c.txt'), 'utf8')).toEqual('c');
    } finally {
      await Promise.all([source, dest].map(p => remove(p)));
    }
  });

  it('should overwrite dest directory when source is a file', async () => {
    const source = join(tmpdir(), 'src');
    const dest = join(tmpdir(), 'dest');
    try {
      await mkdirp(source);
      await mkdirp(join(dest, 'a'));
      await writeFile(join(source, 'a'), 'a');
      await merge(source, dest);
      const destContents = await readdir(dest);
      expect(destContents.sort()).toEqual(['a']);
      const sourceStat: Error = await stat(source).then(
        () => {},
        err => err
      );
      expect(isErrnoException(sourceStat) && sourceStat.code).toEqual('ENOENT');
      expect(await readFile(join(dest, 'a'), 'utf8')).toEqual('a');
    } finally {
      await Promise.all([source, dest].map(p => remove(p)));
    }
  });
});
