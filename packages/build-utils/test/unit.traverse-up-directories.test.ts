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
            root: 'C:\\foo\\bar',
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
            root: '/foo/bar',
            expected: ['/foo/bar/baz/another', '/foo/bar/baz', '/foo/bar'],
          },
        ]
  )(
    'should traverse start="$start", root="$root"',
    ({ start, root, expected }) => {
      expect(Array.from(traverseUpDirectories(start, root))).toEqual(expected);
    }
  );
});
