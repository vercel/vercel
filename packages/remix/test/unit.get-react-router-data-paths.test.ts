import { describe, it, expect } from 'vitest';
import { getReactRouterDataPaths } from '../src/utils';

describe('getReactRouterDataPaths()', () => {
  it.each([
    {
      path: 'about',
      expected: ['about.data'],
    },
    {
      path: 'api/hello',
      expected: ['api/hello.data'],
    },
    {
      path: 'projects/create',
      expected: ['projects/create.data'],
    },
    {
      path: 'projects/*',
      expected: ['projects/*.data'],
    },
    {
      path: ':foo/:bar/:baz',
      expected: [':foo/:bar/:baz.data'],
    },
    {
      path: '(:lang)',
      expected: ['(:lang).data'],
    },
  ])('should return only `<path>.data` for non-root path "$path"', ({
    path,
    expected,
  }) => {
    expect(getReactRouterDataPaths(path)).toEqual(expected);
  });

  it('should also return `_root.data` for the root index path', () => {
    // `getPathFromRoute()` resolves the root index route to `path === 'index'`.
    // React Router single-fetch uses `/_root.data` for that route's
    // single-fetch URL, not `/index.data`, so both must be registered.
    expect(getReactRouterDataPaths('index')).toEqual([
      'index.data',
      '_root.data',
    ]);
  });
});
