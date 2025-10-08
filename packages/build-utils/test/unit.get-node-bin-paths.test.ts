import { join } from 'path';
import { getNodeBinPaths } from '../src/fs/run-user-scripts';
import { describe, it, expect } from 'vitest';

describe('getNodeBinPaths()', () => {
  const cwd = process.cwd();

  it('should return array of `node_modules/.bin` paths', () => {
    const start = join(cwd, 'foo/bar/baz');
    const paths = getNodeBinPaths({ start, base: cwd });
    expect(paths).toEqual([
      join(cwd, 'foo/bar/baz/node_modules/.bin'),
      join(cwd, 'foo/bar/node_modules/.bin'),
      join(cwd, 'foo/node_modules/.bin'),
      join(cwd, 'node_modules/.bin'),
    ]);
  });
});
