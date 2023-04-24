import { getPathFromRoute } from '../src/utils';
import type { RouteManifest } from '@remix-run/dev/dist/config/routes';

describe('getPathFromRoute()', () => {
  const routes: RouteManifest = {
    root: { path: '', id: 'root', file: 'root.tsx' },
    'routes/__pathless': {
      path: undefined,
      id: 'routes/__pathless',
      parentId: 'root',
      file: 'routes/__pathless.tsx',
    },
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
    'routes/projects/__pathless': {
      path: undefined,
      id: 'routes/projects/__pathless',
      parentId: 'routes/projects',
      file: 'routes/projects/__pathless.tsx',
    },
    'routes/projects/index': {
      path: undefined,
      index: true,
      id: 'routes/projects/index',
      parentId: 'routes/projects',
      file: 'routes/projects/index.tsx',
    },
    'routes/projects/create': {
      path: 'create',
      id: 'routes/projects/create',
      parentId: 'routes/projects',
      file: 'routes/projects/create.tsx',
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
    'routes/nested/index': {
      path: 'nested',
      index: true,
      caseSensitive: undefined,
      id: 'routes/nested/index',
      parentId: 'root',
      file: 'routes/nested/index.tsx',
    },
    'routes/($lang)/index': {
      path: ':lang?',
      index: true,
      caseSensitive: undefined,
      id: 'routes/($lang)/index',
      parentId: 'root',
      file: 'routes/($lang)/index.tsx',
    },
    'routes/($lang)/other': {
      path: ':lang?/other',
      index: undefined,
      caseSensitive: undefined,
      id: 'routes/($lang)/other',
      parentId: 'root',
      file: 'routes/($lang)/other.tsx',
    },
    'routes/($lang)/$pid': {
      path: ':lang?/:pid',
      index: undefined,
      caseSensitive: undefined,
      id: 'routes/($lang)/$pid',
      parentId: 'root',
      file: 'routes/($lang)/$pid.tsx',
    },
    'routes/admin.(lol)': {
      path: 'admin/lol?',
      index: undefined,
      caseSensitive: undefined,
      id: 'routes/admin.(lol)',
      parentId: 'root',
      file: 'routes/admin.(lol).tsx',
    },
  };

  it.each([
    { id: 'root', expected: { path: 'index', rePath: '/index' } },
    { id: 'routes/__pathless', expected: { path: '', rePath: '/' } },
    { id: 'routes/index', expected: { path: 'index', rePath: '/index' } },
    {
      id: 'routes/api.hello',
      expected: { path: 'api/hello', rePath: '/api/hello' },
    },
    {
      id: 'routes/nested/index',
      expected: { path: 'nested', rePath: '/nested' },
    },
    {
      id: 'routes/projects',
      expected: { path: 'projects', rePath: '/projects' },
    },
    {
      id: 'routes/projects/__pathless',
      expected: { path: 'projects', rePath: '/projects' },
    },
    {
      id: 'routes/projects/index',
      expected: { path: 'projects', rePath: '/projects' },
    },
    {
      id: 'routes/projects/create',
      expected: { path: 'projects/create', rePath: '/projects/create' },
    },
    {
      id: 'routes/projects/$',
      expected: { path: 'projects/*', rePath: '/projects/:params*' },
    },
    {
      id: 'routes/$foo.$bar.$baz',
      expected: { path: ':foo/:bar/:baz', rePath: '/:foo/:bar/:baz' },
    },
    { id: 'routes/node', expected: { path: 'node', rePath: '/node' } },
    { id: 'routes/$', expected: { path: '*', rePath: '/:params*' } },
    {
      id: 'routes/($lang)/index',
      expected: { path: '(:lang)', rePath: '/:lang?' },
    },
    {
      id: 'routes/($lang)/other',
      expected: { path: '(:lang)/other', rePath: '/:lang?/other' },
    },
    {
      id: 'routes/($lang)/$pid',
      expected: { path: '(:lang)/:pid', rePath: '/:lang?/:pid' },
    },
    {
      id: 'routes/admin.(lol)',
      expected: { path: 'admin/(lol)', rePath: '/admin/(lol)?' },
    },
  ])('should return `$expected` for "$id" route', ({ id, expected }) => {
    const route = routes[id];
    expect(getPathFromRoute(route, routes)).toMatchObject(expected);
  });
});
