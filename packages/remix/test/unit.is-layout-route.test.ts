import { isLayoutRoute } from '../src/utils';

describe('isLayoutRoute()', () => {
  const routes = [
    { id: 'root' },
    { id: 'routes/auth', parentId: 'root' },
    { id: 'routes/login', parentId: 'routes/auth' },
    { id: 'routes/logout', parentId: 'routes/auth' },
    { id: 'routes/index', parentId: 'root' },
  ];

  it.each([
    { id: 'root', expected: true },
    { id: 'routes/auth', expected: true },
    { id: 'routes/index', expected: false },
    { id: 'routes/login', expected: false },
    { id: 'routes/logout', expected: false },
  ])('should return `$expected` for "$id" route', ({ id, expected }) => {
    expect(isLayoutRoute(id, routes)).toEqual(expected);
  });
});
