import {
  assertPathWithinDirectory,
  hasParentDirectorySegment,
} from '../src/fs/path-containment';

describe('hasParentDirectorySegment()', () => {
  it.each([
    '../../outside/file',
    'admin/../../outside',
    '../target',
    '..',
    'extra/../../target',
  ])('returns true for traversal path %s', path => {
    expect(hasParentDirectorySegment(path)).toBe(true);
  });

  it.each([
    'admin',
    'admin/api',
    '.',
    './admin',
    '/admin',
  ])('returns false for safe path %s', path => {
    expect(hasParentDirectorySegment(path)).toBe(false);
  });
});

describe('assertPathWithinDirectory()', () => {
  it('allows paths inside the root directory', () => {
    expect(() =>
      assertPathWithinDirectory('/tmp/output/static', '/tmp/output/static/a/b')
    ).not.toThrow();
  });

  it('rejects paths that escape the root directory', () => {
    expect(() =>
      assertPathWithinDirectory(
        '/tmp/project/.vercel/output/static',
        '/tmp/outside-target/file.html'
      )
    ).toThrow(/resolves outside/);
  });
});
