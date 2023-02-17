import { getPathFromRoute } from '../src/utils';
import type { RouteManifest } from '@remix-run/dev/dist/config/routes';

describe('getPathFromRoute()', () => {
  const routes: RouteManifest = {
    root: { path: '', id: 'root', file: 'root.tsx' },
    'routes/$foo.$bar.$baz': {
      path: ':foo/:bar/:baz',
      id: 'routes/$foo.$bar.$baz',
      parentId: 'root',
      file: 'routes/$foo.$bar.$baz.tsx',
    },
    'routes/api.hello': {
      path: 'api/hello',
      id: 'routes/api.hello',
      parentId: 'root',
      file: 'routes/api.hello.tsx',
    },
    'routes/projects': {
      path: 'projects',
      id: 'routes/projects',
      parentId: 'root',
      file: 'routes/projects.tsx',
    },
    'routes/projects/index': {
      path: undefined,
      index: true,
      id: 'routes/projects/indexx',
      parentId: 'routes/projects',
      file: 'routes/projects/indexx.tsx',
    },
    'routes/projects/$': {
      path: '*',
      id: 'routes/projects/$',
      parentId: 'routes/projects',
      file: 'routes/projects/$.tsx',
    },
    'routes/index': {
      path: undefined,
      index: true,
      id: 'routes/index',
      parentId: 'root',
      file: 'routes/index.tsx',
    },
    'routes/node': {
      path: 'node',
      id: 'routes/node',
      parentId: 'root',
      file: 'routes/node.tsx',
    },
    'routes/$': {
      path: '*',
      id: 'routes/$',
      parentId: 'root',
      file: 'routes/$.tsx',
    },
  };

  it.each([
    { id: 'root', expected: '' },
    { id: 'routes/index', expected: 'index' },
    { id: 'routes/api.hello', expected: 'api/hello' },
    { id: 'routes/projects', expected: 'projects' },
    { id: 'routes/projects/index', expected: 'projects/index' },
    { id: 'routes/projects/$', expected: 'projects/*' },
    { id: 'routes/$foo.$bar.$baz', expected: ':foo/:bar/:baz' },
    { id: 'routes/node', expected: 'node' },
    { id: 'routes/$', expected: '*' },
  ])('should return `$expected` for "$id" route', ({ id, expected }) => {
    const route = routes[id];
    expect(getPathFromRoute(route, routes)).toEqual(expected);
  });
});
