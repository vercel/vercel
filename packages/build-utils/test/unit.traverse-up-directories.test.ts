import { describe, expect, test } from 'vitest';
import { traverseUpDirectories } from '../src/fs/run-user-scripts';

const isWindows = process.platform === 'win32';

describe('traverseUpDirectories()', () => {
  test.each(
    isWindows
      ? [
          {
            start: 'C:\\foo\\bar\\baz',
            expected: ['C:\\foo\\bar\\baz', 'C:\\foo\\bar', 'C:\\foo', 'C:\\'],
          },
          {
            start: 'C:\\foo\\..\\bar\\.\\baz',
            expected: ['C:\\bar\\baz', 'C:\\bar', 'C:\\'],
          },
          {
            start: 'C:\\foo\\bar\\baz\\another',
            base: 'C:\\foo\\bar',
            expected: [
              'C:\\foo\\bar\\baz\\another',
              'C:\\foo\\bar\\baz',
              'C:\\foo\\bar',
            ],
          },
        ]
      : [
          {
            start: '/foo/bar/baz',
            expected: ['/foo/bar/baz', '/foo/bar', '/foo', '/'],
          },
          {
            start: '/foo/../bar/./baz',
            expected: ['/bar/baz', '/bar', '/'],
          },
          {
            start: '/foo/bar/baz/another',
            base: '/foo/bar',
            expected: ['/foo/bar/baz/another', '/foo/bar/baz', '/foo/bar'],
          },
        ]
  )(
    'should traverse start="$start", base="$base"',
    ({ start, base, expected }) => {
      expect(Array.from(traverseUpDirectories({ start, base }))).toEqual(
        expected
      );
    }
  );
});
