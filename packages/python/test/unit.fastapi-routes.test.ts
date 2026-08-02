import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import {
  fastapiShadowingRoutes,
  fastapiFallbackRoutes,
  copyFastAPIStaticMounts,
  type FastAPICollectStaticResult,
  type FastAPIStaticMount,
} from '../src/fastapi';

// A discovery result carrying only the fields the route helpers read.
function discovery(
  over: Partial<FastAPICollectStaticResult>
): FastAPICollectStaticResult {
  return {
    collectedMounts: [],
    cdnOutputDir: '/out',
    shadowRoutes: [],
    fallbacks: [],
    ...over,
  };
}

describe('fastapiShadowingRoutes', () => {
  it('returns [] when nothing is shadowed', () => {
    expect(
      fastapiShadowingRoutes(discovery({ shadowRoutes: [] }), 'api/index')
    ).toEqual([]);
  });

  it('ORs the (pre-escaped) shadow bodies into one group routed to the Lambda', () => {
    expect(
      fastapiShadowingRoutes(
        discovery({
          shadowRoutes: ['static/example\\.txt', 'items/(?:[0-9]+)'],
        }),
        'api/index'
      )
    ).toEqual([
      {
        src: '^/((?:static/example\\.txt|items/(?:[0-9]+))/?)$',
        dest: '/api/index',
        transforms: [{ type: 'request.path', op: 'set', args: '/$1' }],
      },
    ]);
  });

  it('splits bodies across routes when one src would exceed the 4096 cap', () => {
    // A root frontend shadows every route; enough of them overflow one src.
    const bodies = Array.from(
      { length: 300 },
      (_, i) => `api/v1/resource${i}/(?:[^/]+)`
    );
    const routes = fastapiShadowingRoutes(
      discovery({ shadowRoutes: bodies }),
      'api/index'
    );

    expect(routes.length).toBeGreaterThan(1);
    for (const r of routes) {
      expect(r.src.length).toBeLessThanOrEqual(4096);
      expect(r.src.startsWith('^/((?:')).toBe(true);
      expect(r.src.endsWith(')/?)$')).toBe(true);
      expect(r.dest).toBe('/api/index');
      expect(r.transforms).toEqual([
        { type: 'request.path', op: 'set', args: '/$1' },
      ]);
    }
    // Every body appears once, in order, across the chunks (none lost or split).
    const recovered = routes.flatMap(r => r.src.slice(6, -5).split('|'));
    expect(recovered).toEqual(bodies);
  });
});

describe('fastapiFallbackRoutes', () => {
  it('returns [] when there are no fallbacks', () => {
    expect(fastapiFallbackRoutes(discovery({}))).toEqual([]);
  });

  it('gates a 200 (index.html) fallback on an Accept navigation header', () => {
    expect(
      fastapiFallbackRoutes(
        discovery({
          collectedMounts: ['/spa'],
          fallbacks: [{ urlPath: '/spa', file: 'index.html', status: 200 }],
        })
      )
    ).toEqual([
      {
        src: '^/spa/(?!.*[^/.]\\.[^/]*$).*$',
        dest: '/spa/index.html',
        status: 200,
        check: true,
        methods: ['GET', 'HEAD'],
        has: [
          {
            type: 'header',
            key: 'accept',
            value:
              '.*(?:text/html|application/xhtml\\+xml)(?![^,]*;\\s*q=0(?:\\.0+)?(?:[,;\\s]|$)).*',
          },
        ],
      },
    ]);
  });

  it('excludes a final segment with a file extension from the 200 fallback', () => {
    const [route] = fastapiFallbackRoutes(
      discovery({
        collectedMounts: ['/spa'],
        fallbacks: [{ urlPath: '/spa', file: 'index.html', status: 200 }],
      })
    );
    const matches = new RegExp(route.src);
    // extension-less paths are navigation -> served
    expect(matches.test('/spa/route')).toBe(true);
    expect(matches.test('/spa/users/42')).toBe(true);
    // a final segment with a file extension is a missing asset, not navigation
    // -> excluded (falls through to the Lambda)
    expect(matches.test('/spa/app.js')).toBe(false);
    expect(matches.test('/spa/users/data.json')).toBe(false);
  });

  it('serves a 404 (404.html) fallback for every miss (no Accept gate)', () => {
    const [route] = fastapiFallbackRoutes(
      discovery({
        collectedMounts: ['/both'],
        fallbacks: [{ urlPath: '/both', file: '404.html', status: 404 }],
      })
    );
    expect(route).toEqual({
      src: '^/both/.*$',
      dest: '/both/404.html',
      status: 404,
      check: true,
      methods: ['GET', 'HEAD'],
    });
    expect(route).not.toHaveProperty('has');
  });

  it('excludes nested sibling mounts via a negative lookahead (root mount)', () => {
    const [route] = fastapiFallbackRoutes(
      discovery({
        collectedMounts: ['/', '/assets', '/api/docs'],
        fallbacks: [{ urlPath: '/', file: 'index.html', status: 200 }],
      })
    );
    expect(route.src).toBe(
      '^/(?!(?:assets|api/docs)(?:/|$))(?!.*[^/.]\\.[^/]*$).*$'
    );
    expect(route.dest).toBe('/index.html');
  });

  it('escapes regex metacharacters in the mount prefix (src only, not dest)', () => {
    const [route] = fastapiFallbackRoutes(
      discovery({
        collectedMounts: ['/v1.0'],
        fallbacks: [{ urlPath: '/v1.0', file: '404.html', status: 404 }],
      })
    );
    expect(route.src).toBe('^/v1\\.0/.*$');
    expect(route.dest).toBe('/v1.0/404.html');
  });

  it('escapes regex metacharacters in nested sibling sub-paths (guard)', () => {
    const [route] = fastapiFallbackRoutes(
      discovery({
        collectedMounts: ['/app', '/app/a.b'],
        fallbacks: [{ urlPath: '/app', file: '404.html', status: 404 }],
      })
    );
    expect(route.src).toBe('^/app/(?!(?:a\\.b)(?:/|$)).*$');
  });
});

it('shadows both slash forms of a route declared with a trailing slash', () => {
  // The shim strips the trailing slash from "/items/" to the body "items", and
  // redirect_slashes 307s "/items" to "/items/", so both forms must reach the
  // Lambda while a deeper path stays on the CDN.
  const [route] = fastapiShadowingRoutes(
    discovery({ shadowRoutes: ['items'] }),
    'api/index'
  );
  const matches = new RegExp(route.src);
  expect(matches.test('/items')).toBe(true);
  expect(matches.test('/items/')).toBe(true);
  expect(matches.test('/items/5')).toBe(false);
});

it('shadows a sub-app subtree but not its nested CDN mounts', () => {
  // The shim emits this body for a sub-app at /api with a nested /api/static.
  const [route] = fastapiShadowingRoutes(
    discovery({ shadowRoutes: ['api(?:/(?!(?:static)(?:/|$)).*)?'] }),
    'api/index'
  );
  const matches = new RegExp(route.src);
  // The bare mount root (which the Mount 307s), the sub-app's routes, and any
  // hijacking frontend files all go to the Lambda.
  expect(matches.test('/api')).toBe(true);
  expect(matches.test('/api/hello')).toBe(true);
  expect(matches.test('/api/hijack.txt')).toBe(true);
  // A nested StaticFiles mount stays on the CDN, so it is excluded.
  expect(matches.test('/api/static/logo.png')).toBe(false);
});

it('shadows a colliding route under a sub-app but not its nested static sibling', () => {
  // A sub-app at /sub with a nested StaticFiles mount at /sub/foo, plus a route
  // that wins at /sub/foo/bar. The shim emits a subtree body and a route body,
  // and the two compose in one group.
  const [route] = fastapiShadowingRoutes(
    discovery({
      shadowRoutes: ['sub(?:/(?!(?:foo)(?:/|$)).*)?', 'sub/foo/bar'],
    }),
    'app'
  );
  const matches = new RegExp(route.src);
  // The bare mount root reaches the Lambda.
  expect(matches.test('/sub')).toBe(true);
  // The winning route reaches the Lambda even though it sits under the mount.
  expect(matches.test('/sub/foo/bar')).toBe(true);
  // Other files in the nested mount stay on the CDN.
  expect(matches.test('/sub/foo/other.txt')).toBe(false);
  // The rest of the sub-app's subtree reaches the Lambda.
  expect(matches.test('/sub/hello')).toBe(true);
});

it('shadows a mount root but not the files under it', () => {
  // The shim emits the bare prefix for a StaticFiles(html=False) mount so the
  // root reaches the Lambda (307 for /static, 404 for /static/).
  const [route] = fastapiShadowingRoutes(
    discovery({ shadowRoutes: ['static'] }),
    'app'
  );
  const matches = new RegExp(route.src);
  expect(matches.test('/static')).toBe(true);
  expect(matches.test('/static/')).toBe(true);
  // Files under the mount stay on the CDN.
  expect(matches.test('/static/index.html')).toBe(false);
  // A sibling path with the same prefix is not caught.
  expect(matches.test('/statics')).toBe(false);
});

it('shadows a root-mounted sub-app subtree but not its nested CDN mounts', () => {
  // The shim emits this body for a sub-app mounted at "/" with a nested
  // /static. There is no prefix, so the builder supplies the leading slash and
  // the body matches the whole path space.
  const [route] = fastapiShadowingRoutes(
    discovery({ shadowRoutes: ['(?!(?:static)(?:/|$)).*'] }),
    'app'
  );
  const matches = new RegExp(route.src);
  // The bare root and every path under it reach the Lambda.
  expect(matches.test('/')).toBe(true);
  expect(matches.test('/foo')).toBe(true);
  expect(matches.test('/foo/bar')).toBe(true);
  // The nested StaticFiles mount stays on the CDN.
  expect(matches.test('/static/logo.png')).toBe(false);
});

it('navigation Accept gate rejects an explicit q=0', () => {
  const [route] = fastapiFallbackRoutes(
    discovery({
      fallbacks: [{ urlPath: '/', file: 'index.html', status: 200 }],
    })
  );
  const accept = (route as { has?: { value: string }[] }).has?.[0]?.value ?? '';
  expect(new RegExp(accept).test('text/html;q=0')).toBe(false);
});

// Every source is flattened into one CDN tree, so each path must hold only what
// its highest-priority owner serves, never a file that leaked across a mount
// boundary from a lower-priority source.
describe('copyFastAPIStaticMounts', () => {
  let root: string;
  let out: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(tmpdir(), 'fastapi-copy-'));
    out = path.join(root, 'out');
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const source = (name: string, files: Record<string, string>): string => {
    const dir = path.join(root, name);
    for (const [rel, content] of Object.entries(files)) {
      const file = path.join(dir, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    return dir;
  };
  const mount = (
    urlPath: string,
    directory: string,
    frontend: boolean
  ): FastAPIStaticMount => ({ urlPath, directory, fallback: null, frontend });
  const exists = (rel: string): boolean => fs.existsSync(path.join(out, rel));
  const read = (rel: string): string =>
    fs.readFileSync(path.join(out, rel), 'utf8');

  it('does not serve a frontend file from inside a plain mount namespace', async () => {
    // The /static mount owns its subtree, so the frontend's /static/extra.txt
    // (which the mount lacks) must not reach the CDN.
    const appMount = source('static', { 'a.txt': 'MOUNT_FILE' });
    const frontend = source('frontend', {
      'index.html': '<h1>app</h1>',
      'static/extra.txt': 'FRONTEND_EXTRA',
    });
    await copyFastAPIStaticMounts(
      [mount('/static', appMount, false), mount('/', frontend, true)],
      out
    );
    expect(exists('static/a.txt')).toBe(true);
    expect(exists('static/extra.txt')).toBe(false);
  });

  it('does not serve a later mount file from inside an earlier mount namespace', async () => {
    // The mount declared first owns /inner, so the later root mount's
    // /inner/only_root.txt must not reach the CDN.
    const inner = source('inner', { 'a.txt': 'INNER_FILE' });
    const rootMount = source('rootdir', {
      'root.txt': 'ROOT_FILE',
      'inner/only_root.txt': 'ROOT_ONLY',
    });
    await copyFastAPIStaticMounts(
      [mount('/inner', inner, false), mount('/', rootMount, false)],
      out
    );
    expect(exists('inner/a.txt')).toBe(true);
    expect(exists('root.txt')).toBe(true);
    expect(exists('inner/only_root.txt')).toBe(false);
  });

  it('resolves a frontend collision by prefix specificity, not declaration order', async () => {
    // The /app frontend is more specific than the / frontend, so it wins
    // /app/x.txt even though it is declared second.
    const rootFe = source('root-fe', {
      'index.html': '<h1>root</h1>',
      'app/x.txt': 'FROM_ROOT',
    });
    const appFe = source('app-fe', {
      'index.html': '<h1>app</h1>',
      'x.txt': 'FROM_APP',
    });
    await copyFastAPIStaticMounts(
      [mount('/', rootFe, true), mount('/app', appFe, true)],
      out
    );
    expect(read('app/x.txt')).toBe('FROM_APP');
  });

  it('does not serve any frontend file once a plain root mount owns the tree', async () => {
    // A plain mount at / owns every path, so the lower-priority frontend is
    // never served and must not reach the CDN.
    const rootMount = source('rootdir', { 'shared.txt': 'FROM_MOUNT' });
    const frontend = source('frontend', {
      'index.html': '<h1>app</h1>',
      'shared.txt': 'FROM_FRONTEND',
    });
    await copyFastAPIStaticMounts(
      [mount('/', rootMount, false), mount('/', frontend, true)],
      out
    );
    expect(read('shared.txt')).toBe('FROM_MOUNT');
    expect(exists('index.html')).toBe(false);
  });
});
