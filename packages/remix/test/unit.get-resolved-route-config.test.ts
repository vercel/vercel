import { getResolvedRouteConfig } from '../src/utils';
import type {
  ConfigRoute,
  RouteManifest,
} from '@remix-run/dev/dist/config/routes';
import type { BaseFunctionConfig } from '@vercel/static-config';

describe('getResolvedRouteConfig()', () => {
  const staticConfigsMap = new Map<ConfigRoute, BaseFunctionConfig | null>([
    [{ id: 'root', file: 'root.tsx' }, null],
    [
      { id: 'routes/edge', file: 'routes/edge.tsx', parentId: 'root' },
      { runtime: 'edge' },
    ],
    [
      {
        id: 'routes/edge/sfo1',
        file: 'routes/edge/sfo1.tsx',
        parentId: 'routes/edge',
      },
      { regions: ['sfo1'] },
    ],
    [
      {
        id: 'routes/edge/iad1',
        file: 'routes/edge/iad1.tsx',
        parentId: 'routes/edge',
      },
      { regions: ['iad1'] },
    ],
    [
      { id: 'routes/node', file: 'routes/node.tsx' },
      { runtime: 'nodejs', regions: ['sfo1'] },
    ],
    [
      {
        id: 'routes/node/mem',
        file: 'routes/node/mem.tsx',
        parentId: 'routes/node',
      },
      { maxDuration: 5, memory: 3008 },
    ],
  ]);

  const routes: RouteManifest = {};
  for (const route of staticConfigsMap.keys()) {
    routes[route.id] = route;
  }

  it.each([
    { id: 'root', expected: { runtime: 'nodejs' } },
    { id: 'routes/edge', expected: { runtime: 'edge' } },
    {
      id: 'routes/edge/sfo1',
      expected: { runtime: 'edge', regions: ['sfo1'] },
    },
    {
      id: 'routes/edge/iad1',
      expected: { runtime: 'edge', regions: ['iad1'] },
    },
    { id: 'routes/node', expected: { runtime: 'nodejs', regions: ['sfo1'] } },
    {
      id: 'routes/node/mem',
      expected: {
        runtime: 'nodejs',
        regions: ['sfo1'],
        maxDuration: 5,
        memory: 3008,
      },
    },
  ])('should resolve config for "$id" route', ({ id, expected }) => {
    const route = routes[id];
    const config = getResolvedRouteConfig(
      route,
      routes,
      staticConfigsMap,
      false
    );
    expect(config).toMatchObject(expected);
  });

  it('should resolve config as "edge" for Hydrogen v2', () => {
    const route = routes['root'];
    const config = getResolvedRouteConfig(
      route,
      routes,
      staticConfigsMap,
      true
    );
    expect(config).toMatchObject({ runtime: 'edge', regions: undefined });
  });
});
