import { describe, it, expect } from 'vitest';
import {
  findPrerenderedHtmlFile,
  getPathFromRoute,
  getPrerenderDocumentRewrite,
  getReactRouterCatchAllDest,
  getReactRouterDataPaths,
  getRegExpFromPath,
  shouldRegisterSsrForPrerenderedRoute,
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

describe('getPrerenderDocumentRewrite()', () => {
  it('rewrites the root path to `index.html`', () => {
    expect(getPrerenderDocumentRewrite('index', 'index.html')).toEqual({
      src: '^/$',
      dest: '/index.html',
    });
  });

  it('rewrites nested prerender paths to their HTML artifact', () => {
    expect(getPrerenderDocumentRewrite('about', 'about.html')).toEqual({
      src: '^/about/?$',
      dest: '/about.html',
    });
  });
});

describe('shouldRegisterSsrForPrerenderedRoute()', () => {
  it('keeps the SSR function only for the prerendered index route', () => {
    expect(shouldRegisterSsrForPrerenderedRoute('index')).toBe(true);
    expect(shouldRegisterSsrForPrerenderedRoute('about')).toBe(false);
    expect(shouldRegisterSsrForPrerenderedRoute('__manifest')).toBe(false);
  });
});

describe('getReactRouterCatchAllDest()', () => {
  it('targets the index SSR function output key', () => {
    expect(getReactRouterCatchAllDest()).toBe('index');
  });
});

type RouteResolution = 'static-html' | 'ssr-function';

function resolveReactRouterRequest(
  requestPath: string,
  options: {
    prerenderRewrites: { src: string; dest: string }[];
    catchAllDest: string;
    hasIndexSsrFunction: boolean;
    staticFiles: Set<string>;
  }
): RouteResolution {
  for (const rewrite of options.prerenderRewrites) {
    if (new RegExp(rewrite.src).test(requestPath)) {
      const staticKey = rewrite.dest.replace(/^\//, '');
      if (options.staticFiles.has(staticKey)) {
        return 'static-html';
      }
    }
  }

  const staticKey = requestPath.replace(/^\//, '');
  if (options.staticFiles.has(staticKey)) {
    return 'static-html';
  }

  if (options.hasIndexSsrFunction && options.catchAllDest === 'index') {
    return 'ssr-function';
  }

  if (options.staticFiles.has('index.html')) {
    return 'static-html';
  }

  return 'ssr-function';
}

describe('react-router runtime route resolution with prerendered index', () => {
  const prerenderRewrites = [
    getPrerenderDocumentRewrite('index', 'index.html'),
    getPrerenderDocumentRewrite('about', 'about.html'),
  ];
  const staticFiles = new Set([
    'index.html',
    '_root.data',
    'about.html',
    'about.data',
  ]);

  it('serves prerendered HTML for document requests', () => {
    expect(
      resolveReactRouterRequest('/', {
        prerenderRewrites,
        catchAllDest: getReactRouterCatchAllDest(),
        hasIndexSsrFunction: true,
        staticFiles,
      })
    ).toBe('static-html');
    expect(
      resolveReactRouterRequest('/about', {
        prerenderRewrites,
        catchAllDest: getReactRouterCatchAllDest(),
        hasIndexSsrFunction: true,
        staticFiles,
      })
    ).toBe('static-html');
  });

  it('routes `/__manifest` to the SSR function instead of prerendered HTML', () => {
    expect(
      resolveReactRouterRequest('/__manifest', {
        prerenderRewrites,
        catchAllDest: getReactRouterCatchAllDest(),
        hasIndexSsrFunction: true,
        staticFiles,
      })
    ).toBe('ssr-function');
  });

  it('regression: prerendered index without SSR catch-all served HTML for `/__manifest`', () => {
    // Mirrors the broken CLI >=54.2.0 behavior from CICD-2715.
    expect(
      resolveReactRouterRequest('/__manifest', {
        prerenderRewrites: [getPrerenderDocumentRewrite('about', 'about.html')],
        catchAllDest: '/',
        hasIndexSsrFunction: false,
        staticFiles,
      })
    ).toBe('static-html');
  });
});

function getSimulatedCatchAllDest(hasReactRouterIndexFunction: boolean) {
  return hasReactRouterIndexFunction ? getReactRouterCatchAllDest() : '/';
}

describe('react-router SPA build output', () => {
  const staticFiles = new Set(['index.html', 'assets/app.js']);

  function simulateSpaBuildOutput() {
    return {
      catchAllDest: getSimulatedCatchAllDest(false),
    };
  }

  it('routes the catch-all through `/` when no index SSR function exists', () => {
    const { catchAllDest } = simulateSpaBuildOutput();
    expect(catchAllDest).toBe('/');
  });

  it('serves `index.html` for SPA subroute refreshes', () => {
    const { catchAllDest } = simulateSpaBuildOutput();
    expect(
      resolveReactRouterRequest('/dashboard/settings', {
        prerenderRewrites: [],
        catchAllDest,
        hasIndexSsrFunction: false,
        staticFiles,
      })
    ).toBe('static-html');
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
    let hasReactRouterIndexFunction = false;

    for (const route of Object.values(routes)) {
      const { path, rePath } = getPathFromRoute(route, routes);
      if (!path) continue;

      const htmlFile = findPrerenderedHtmlFile(path, staticFileKeys);
      if (htmlFile) {
        prerenderRewrites.push(getPrerenderDocumentRewrite(path, htmlFile));
        if (!shouldRegisterSsrForPrerenderedRoute(path)) {
          assignments.push({ kind: 'static', path, htmlFile });
          continue;
        }
      }

      assignments.push({ kind: 'function', path });
      if (path === 'index') {
        hasReactRouterIndexFunction = true;
      }
      for (const dataPath of getReactRouterDataPaths(path)) {
        if (!staticFileKeys.has(dataPath)) {
          dataAssignments.push({ dataPath, kind: 'function' });
        }
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

    return {
      assignments,
      dataAssignments,
      prerenderRewrites,
      dynamicRules,
      catchAllDest: getSimulatedCatchAllDest(hasReactRouterIndexFunction),
    };
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
    // The index route is prerendered but still registers its SSR function
    // so runtime-only paths like `/__manifest` can reach the handler.
    expect(indexAssignment).toEqual({ kind: 'function', path: 'index' });
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

  it('does not overwrite prerendered `.data` files with the SSR function', () => {
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
    // The root single-fetch URL is `/_root.data`; `index.data` is not
    // prerendered and may still map to the SSR function.
    expect(dataAssignments.find(d => d.dataPath === 'index.data')).toEqual({
      dataPath: 'index.data',
      kind: 'function',
    });
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
    // The root route also needs an explicit rewrite so the catch-all SSR
    // handler does not serve prerendered HTML for runtime-only paths.
    expect(prerenderRewrites).toContainEqual({
      src: '^/$',
      dest: '/index.html',
    });
  });

  it('routes the catch-all to the index SSR function for runtime-only paths', () => {
    const { catchAllDest } = simulateBuildOutput();
    // Internal React Router routes like `/__manifest` are not in the route
    // manifest and rely on the catch-all reaching the SSR handler instead
    // of a prerendered `index.html`.
    expect(catchAllDest).toBe('index');
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
