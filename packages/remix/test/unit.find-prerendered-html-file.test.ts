import { describe, it, expect } from 'vitest';
import {
  findPrerenderedHtmlFile,
  getPathFromRoute,
  getReactRouterDataPaths,
  getRegExpFromPath,
} from '../src/utils';
import type { RouteManifest } from '../src/types';

describe('findPrerenderedHtmlFile()', () => {
  it('returns the matching `<path>.html` file for a static route', () => {
    const keys = new Set(['about.html', 'about.data', 'index.html']);
    expect(findPrerenderedHtmlFile('about', keys)).toBe('about.html');
  });

  it('returns `index.html` for the root index path', () => {
    const keys = new Set(['index.html', '_root.data']);
    expect(findPrerenderedHtmlFile('index', keys)).toBe('index.html');
  });

  it('falls back to `<path>/index.html` when `<path>.html` is absent', () => {
    // React Router has historically emitted directory-style HTML files for
    // some prerendered routes; tolerate both layouts.
    const keys = new Set(['docs/getting-started/index.html']);
    expect(findPrerenderedHtmlFile('docs/getting-started', keys)).toBe(
      'docs/getting-started/index.html'
    );
  });

  it('returns undefined when no prerender artifact exists', () => {
    const keys = new Set(['assets/app.js', 'favicon.ico']);
    expect(findPrerenderedHtmlFile('about', keys)).toBeUndefined();
  });

  it('does not match dynamic paths whose literal segment is not on disk', () => {
    // The detection is purely file-based, so dynamic paths like
    // `posts/:slug` never match (RR doesn't emit a `posts/:slug.html` file).
    const keys = new Set(['posts/foo.html', 'posts/foo.data']);
    expect(findPrerenderedHtmlFile('posts/:slug', keys)).toBeUndefined();
  });
});

// Integration-style assertion that mirrors the per-route loop in
// `build-vite.ts` for React Router. Given a synthetic route manifest and a
// set of static-file keys that mimic what `prerender()` would have written
// to `build/client/`, walk every route the same way the build loop does and
// snapshot the resulting `output` keys, prerender rewrites, and SSR function
// overrides. Catches regressions in prerender handling (e.g. the SSR function
// shadowing a prerendered route) without requiring a deployment.
describe('react-router prerender build output', () => {
  const routes: RouteManifest = {
    root: { id: 'root', file: 'app/root.tsx', path: '' },
    'routes/home': {
      id: 'routes/home',
      parentId: 'root',
      file: 'app/routes/home.tsx',
      index: true,
    },
    'routes/about': {
      id: 'routes/about',
      parentId: 'root',
      file: 'app/routes/about.tsx',
      path: 'about',
    },
    'routes/contact': {
      id: 'routes/contact',
      parentId: 'root',
      file: 'app/routes/contact.tsx',
      path: 'contact',
    },
    'routes/api.users.$id': {
      id: 'routes/api.users.$id',
      parentId: 'root',
      file: 'app/routes/api.users.$id.ts',
      path: 'api/users/:id',
    },
  };

  // Simulate `prerender()` emitting static HTML + .data for `/` and `/about`
  // (but NOT `/contact` or the dynamic `/api/users/:id` route).
  const staticFileKeys = new Set([
    'assets/app.js',
    'favicon.ico',
    'index.html',
    '_root.data',
    'about.html',
    'about.data',
  ]);

  type OutputAssignment =
    | { kind: 'function'; path: string }
    | { kind: 'static'; path: string; htmlFile: string };

  function simulateBuildOutput() {
    const assignments: OutputAssignment[] = [];
    const dataAssignments: { dataPath: string; kind: 'function' }[] = [];
    const prerenderRewrites: { src: string; dest: string }[] = [];
    const dynamicRules: { src: string; dest: string }[] = [];

    for (const route of Object.values(routes)) {
      const { path, rePath } = getPathFromRoute(route, routes);
      if (!path) continue;

      const htmlFile = findPrerenderedHtmlFile(path, staticFileKeys);
      if (htmlFile) {
        assignments.push({ kind: 'static', path, htmlFile });
        if (path !== 'index') {
          prerenderRewrites.push({
            src: `^/${path}/?$`,
            dest: `/${htmlFile}`,
          });
        }
        continue;
      }

      assignments.push({ kind: 'function', path });
      for (const dataPath of getReactRouterDataPaths(path)) {
        dataAssignments.push({ dataPath, kind: 'function' });
      }
      const reData = getRegExpFromPath(`${rePath}.data`);
      if (reData) {
        dynamicRules.push({ src: reData.source, dest: `${path}.data` });
      }
      const re = getRegExpFromPath(rePath);
      if (re) {
        dynamicRules.push({ src: re.source, dest: path });
      }
    }

    return { assignments, dataAssignments, prerenderRewrites, dynamicRules };
  }

  it('does not install an SSR function override for prerendered routes', () => {
    const { assignments } = simulateBuildOutput();
    const aboutAssignment = assignments.find(a => a.path === 'about');
    expect(aboutAssignment).toEqual({
      kind: 'static',
      path: 'about',
      htmlFile: 'about.html',
    });

    const indexAssignment = assignments.find(a => a.path === 'index');
    expect(indexAssignment).toEqual({
      kind: 'static',
      path: 'index',
      htmlFile: 'index.html',
    });
  });

  it('still installs an SSR function override for non-prerendered routes', () => {
    const { assignments } = simulateBuildOutput();
    const contactAssignment = assignments.find(a => a.path === 'contact');
    expect(contactAssignment).toEqual({ kind: 'function', path: 'contact' });

    const dynamicAssignment = assignments.find(a => a.path === 'api/users/:id');
    expect(dynamicAssignment).toEqual({
      kind: 'function',
      path: 'api/users/:id',
    });
  });

  it('does not overwrite the prerendered `.data` file with the SSR function', () => {
    // For a prerendered route, the `.data` file was emitted by RR's prerender
    // step and is already in `staticFiles`. The build loop must NOT assign
    // the SSR function over the static `.data` key.
    const { dataAssignments } = simulateBuildOutput();
    expect(
      dataAssignments.find(d => d.dataPath === 'about.data')
    ).toBeUndefined();
    expect(
      dataAssignments.find(d => d.dataPath === '_root.data')
    ).toBeUndefined();
    expect(
      dataAssignments.find(d => d.dataPath === 'index.data')
    ).toBeUndefined();
  });

  it('emits a pre-filesystem rewrite from `/<path>` to the prerendered HTML file', () => {
    const { prerenderRewrites } = simulateBuildOutput();
    // The BOA filesystem handle matches keys exactly, so a request for
    // `/about` needs an explicit rewrite to `/about.html` to resolve the
    // prerendered file.
    expect(prerenderRewrites).toContainEqual({
      src: '^/about/?$',
      dest: '/about.html',
    });
    // No rewrite needed for the root because BOA's filesystem handle
    // already resolves `/` to `index.html` via the conventional index
    // lookup; emitting a redundant rule would just be noise.
    expect(
      prerenderRewrites.find(r => r.dest === '/index.html')
    ).toBeUndefined();
  });

  it('does not emit dynamic regex rules for prerendered routes', () => {
    // Prerendered routes have no dynamic segments by construction, so
    // `getRegExpFromPath` would already return false. Confirm the simulated
    // loop produces dynamic rules only for the un-prerendered dynamic route.
    const { dynamicRules } = simulateBuildOutput();
    const aboutRule = dynamicRules.find(
      r => r.dest === 'about' || r.dest === 'about.data'
    );
    expect(aboutRule).toBeUndefined();
    // The dynamic `api/users/:id` route still produces its rules.
    expect(
      dynamicRules.find(r => r.dest === 'api/users/:id.data')
    ).toBeDefined();
    expect(dynamicRules.find(r => r.dest === 'api/users/:id')).toBeDefined();
  });
});
