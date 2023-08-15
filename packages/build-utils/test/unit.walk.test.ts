import { walkParentDirs } from '../src';
import { strict } from 'assert';
import { join } from 'path';
import { promises } from 'fs';
const { notDeepEqual, fail } = strict;
const { readFile } = promises;
const fixture = (name: string) => join(__dirname, 'walk', name);
const filename = 'file.txt';

async function assertContent(target: string | null, contents: string) {
  notDeepEqual(target, null);
  const actual = await readFile(target!, 'utf8');
  strict.deepEqual(actual.trim(), contents.trim());
}

describe('Test `walkParentDirs`', () => {
  it.skip('should throw when `base` is relative', async () => {
    const base = './relative';
    const start = __dirname;
    try {
      await walkParentDirs({ base, start, filename });
      fail('Expected error');
    } catch (error) {
      strict.deepEqual(
        (error as Error).message,
        'Expected "base" to be absolute path'
      );
    }
  });

  it.skip('should throw when `start` is relative', async () => {
    const base = __dirname;
    const start = './relative';
    try {
      await walkParentDirs({ base, start, filename });
      fail('Expected error');
    } catch (error) {
      strict.deepEqual(
        (error as Error).message,
        'Expected "start" to be absolute path'
      );
    }
  });

  it.skip('should find nested one', async () => {
    const base = fixture('every-directory');
    const start = base;
    const target = await walkParentDirs({ base, start, filename });
    await assertContent(target, 'First');
  });

  it.skip('should find nested two', async () => {
    const base = fixture('every-directory');
    const start = join(base, 'two');
    const target = await walkParentDirs({ base, start, filename });
    await assertContent(target, 'Second');
  });

  it.skip('should find nested three', async () => {
    const base = fixture('every-directory');
    const start = join(base, 'two', 'three');
    const target = await walkParentDirs({ base, start, filename });
    await assertContent(target, 'Third');
  });

  it.skip('should not find nested one', async () => {
    const base = fixture('not-found');
    const start = base;
    const target = await walkParentDirs({ base, start, filename });
    strict.deepEqual(target, null);
  });

  it.skip('should not find nested two', async () => {
    const base = fixture('not-found');
    const start = join(base, 'two');
    const target = await walkParentDirs({ base, start, filename });
    strict.deepEqual(target, null);
  });

  it.skip('should not find nested three', async () => {
    const base = fixture('not-found');
    const start = join(base, 'two', 'three');
    const target = await walkParentDirs({ base, start, filename });
    strict.deepEqual(target, null);
  });

  it.skip('should find only one', async () => {
    const base = fixture('only-one');
    const start = join(base, 'two', 'three');
    const target = await walkParentDirs({ base, start, filename });
    await assertContent(target, 'First');
  });

  it.skip('should find only two', async () => {
    const base = fixture('only-two');
    const start = join(base, 'two', 'three');
    const target = await walkParentDirs({ base, start, filename });
    await assertContent(target, 'Second');
  });

  it.skip('should find only three', async () => {
    const base = fixture('only-three');
    const start = join(base, 'two', 'three');
    const target = await walkParentDirs({ base, start, filename });
    await assertContent(target, 'Third');
  });
});
