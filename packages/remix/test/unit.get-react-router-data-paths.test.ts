import { describe, it, expect } from 'vitest';
import {
  getPathFromRoute,
  getReactRouterDataPaths,
  getRegExpFromPath,
} from '../src/utils';
import type { RouteManifest } from '../src/types';

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

// Integration-style assertion that mirrors the per-route loop in
// `build-vite.ts` for React Router. Given a synthetic route manifest matching
// the `08-react-router-single-fetch-data` fixture, walk every route the same
// way the build loop does and snapshot the resulting `output` keys and
// dynamic-route `dest` values. Catches regressions in single-fetch routing
// (e.g. `_root.data` missing, dynamic `.data` rule order, splat handling)
// without requiring a deployment.
describe('react-router single-fetch build output', () => {
  const routes: RouteManifest = {
    root: { id: 'root', file: 'app/root.tsx', path: '' },
    'routes/home': {
      id: 'routes/home',
      parentId: 'root',
      file: 'app/routes/home.tsx',
      index: true,
    },
    'routes/api.getClusters': {
      id: 'routes/api.getClusters',
      parentId: 'root',
      file: 'app/routes/api.getClusters.ts',
      path: 'api/getClusters',
    },
    'routes/api.clusters.$id': {
      id: 'routes/api.clusters.$id',
      parentId: 'root',
      file: 'app/routes/api.clusters.$id.ts',
      path: 'api/clusters/:id',
    },
    'routes/catch-all': {
      id: 'routes/catch-all',
      parentId: 'root',
      file: 'app/routes/catch-all.tsx',
      path: '*',
    },
  };

  function simulateBuildOutput() {
    const outputKeys: string[] = [];
    const dynamicRules: { src: string; dest: string }[] = [];
    for (const route of Object.values(routes)) {
      const { path, rePath } = getPathFromRoute(route, routes);
      if (!path) continue;
      outputKeys.push(path);
      for (const dataPath of getReactRouterDataPaths(path)) {
        outputKeys.push(dataPath);
      }
      const reData = getRegExpFromPath(`${rePath}.data`);
      if (reData) {
        dynamicRules.push({
          src: reData.source,
          dest: `${path}.data`,
        });
      }
      const re = getRegExpFromPath(rePath);
      if (re) {
        dynamicRules.push({ src: re.source, dest: path });
      }
    }
    return { outputKeys, dynamicRules };
  }

  it('emits a `.data` entry for every concrete route, including `_root.data`', () => {
    const { outputKeys } = simulateBuildOutput();
    expect(outputKeys).toContain('index');
    expect(outputKeys).toContain('index.data');
    // Root index single-fetch URL is `/_root.data`, not `/index.data`.
    expect(outputKeys).toContain('_root.data');
    expect(outputKeys).toContain('api/getClusters');
    expect(outputKeys).toContain('api/getClusters.data');
    expect(outputKeys).toContain('api/clusters/:id');
    expect(outputKeys).toContain('api/clusters/:id.data');
    expect(outputKeys).toContain('*');
    expect(outputKeys).toContain('*.data');
  });

  it('pushes the `.data` dynamic rule before the non-data rule', () => {
    const { dynamicRules } = simulateBuildOutput();
    const dataIndex = dynamicRules.findIndex(
      r => r.dest === 'api/clusters/:id.data'
    );
    const plainIndex = dynamicRules.findIndex(
      r => r.dest === 'api/clusters/:id'
    );
    expect(dataIndex).toBeGreaterThanOrEqual(0);
    expect(plainIndex).toBeGreaterThanOrEqual(0);
    // The `.data` rule must come first; otherwise the plain rule would match
    // `api/clusters/42.data` (treating `.data` as part of the param value)
    // and rewrite the URL, stripping the suffix before the function runs.
    expect(dataIndex).toBeLessThan(plainIndex);
  });

  it('produces a `.data` rule that matches dynamic single-fetch URLs', () => {
    const { dynamicRules } = simulateBuildOutput();
    const dataRule = dynamicRules.find(r => r.dest === 'api/clusters/:id.data');
    expect(dataRule).toBeDefined();
    expect(new RegExp(dataRule!.src).test('/api/clusters/42.data')).toBe(true);
    expect(new RegExp(dataRule!.src).test('/api/clusters/42')).toBe(false);
  });

  it('produces a splat `.data` rule that matches arbitrary single-fetch URLs', () => {
    const { dynamicRules } = simulateBuildOutput();
    const splatDataRule = dynamicRules.find(r => r.dest === '*.data');
    expect(splatDataRule).toBeDefined();
    expect(new RegExp(splatDataRule!.src).test('/some/random/path.data')).toBe(
      true
    );
  });
});
