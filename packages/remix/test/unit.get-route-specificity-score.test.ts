import { describe, it, expect } from 'vitest';
import { getRouteSpecificityScore } from '../src/utils';

describe('getRouteSpecificityScore()', () => {
  const sortPaths = (paths: string[]) =>
    [...paths].sort(
      (a, b) => getRouteSpecificityScore(b) - getRouteSpecificityScore(a)
    );

  it('ranks static segments above dynamic segments', () => {
    expect(sortPaths([':slug', 'api/:id', 'api/hello'])).toEqual([
      'api/hello',
      'api/:id',
      ':slug',
    ]);
  });

  it('ranks splats below dynamic and static routes', () => {
    expect(sortPaths([':slug/*', 'api/items/:id/export', ':a/:b'])).toEqual([
      'api/items/:id/export',
      ':a/:b',
      ':slug/*',
    ]);
  });

  it('ranks deeper routes above shallower catch-alls', () => {
    expect(sortPaths(['*', 'docs/*', 'docs/:page/*'])).toEqual([
      'docs/:page/*',
      'docs/*',
      '*',
    ]);
  });

  it('treats optional params as dynamic segments', () => {
    expect(getRouteSpecificityScore('posts/(:id)')).toBe(
      getRouteSpecificityScore('posts/:id')
    );
  });

  it('keeps definition order for equally specific routes', () => {
    expect(sortPaths([':a', ':b', ':c'])).toEqual([':a', ':b', ':c']);
  });
});
