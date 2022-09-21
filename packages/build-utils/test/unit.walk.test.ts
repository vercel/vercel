import { strict } from 'assert';
import { join } from 'path';
import { promises } from 'fs';
import { walkParentDirs } from '../src';

const { deepEqual, fail } = strict;
const { readFile } = promises;
const fixture = (name: string) => join(__dirname, 'walk', name);
const filename = 'file.txt';

async function expectContent(target: string | null, contents: string) {
  if (typeof target !== 'string') {
    throw new Error(`Expected target to be a string`);
  }
  const actual = await readFile(target, 'utf8');
  expect;
  deepEqual(actual.trim(), contents.trim());
}

describe('walkParentDirs()', () => {
  it('should throw when `base` is relative', async () => {
    let err: Error | undefined;
    const base = './relative';
    const start = __dirname;
    try {
      await walkParentDirs({ base, start, filename });
      fail('Expected error');
    } catch (_err) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      err = _err;
    }
    if (!err) {
      throw new Error('Expected `err` to be defined');
    }
    expect(err.message).toEqual('Expected "base" to be absolute path');
  });

  it('should throw when `start` is relative', async () => {
    const base = __dirname;
    const start = './relative';
    try {
      await walkParentDirs({ base, start, filename });
      fail('Expected error');
    } catch (error) {
      deepEqual(
        (error as Error).message,
        'Expected "start" to be absolute path',
      );
    }
  });

  it('should find nested one', async () => {
    const base = fixture('every-directory');
    const start = base;
    const target = await walkParentDirs({ base, start, filename });
    await expectContent(target, 'First');
  });

  it('should find nested two', async () => {
    const base = fixture('every-directory');
    const start = join(base, 'two');
    const target = await walkParentDirs({ base, start, filename });
    await expectContent(target, 'Second');
  });

  it('should find nested three', async () => {
    const base = fixture('every-directory');
    const start = join(base, 'two', 'three');
    const target = await walkParentDirs({ base, start, filename });
    await expectContent(target, 'Third');
  });

  it('should not find nested one', async () => {
    const base = fixture('not-found');
    const start = base;
    const target = await walkParentDirs({ base, start, filename });
    deepEqual(target, null);
  });

  it('should not find nested two', async () => {
    const base = fixture('not-found');
    const start = join(base, 'two');
    const target = await walkParentDirs({ base, start, filename });
    deepEqual(target, null);
  });

  it('should not find nested three', async () => {
    const base = fixture('not-found');
    const start = join(base, 'two', 'three');
    const target = await walkParentDirs({ base, start, filename });
    deepEqual(target, null);
  });

  it('should find only one', async () => {
    const base = fixture('only-one');
    const start = join(base, 'two', 'three');
    const target = await walkParentDirs({ base, start, filename });
    await expectContent(target, 'First');
  });

  it('should find only two', async () => {
    const base = fixture('only-two');
    const start = join(base, 'two', 'three');
    const target = await walkParentDirs({ base, start, filename });
    await expectContent(target, 'Second');
  });

  it('should find only three', async () => {
    const base = fixture('only-three');
    const start = join(base, 'two', 'three');
    const target = await walkParentDirs({ base, start, filename });
    await expectContent(target, 'Third');
  });
});
