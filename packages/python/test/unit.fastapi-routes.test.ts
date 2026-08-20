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
    mountPrefixes: [],
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

  it('drops a body too long for a src even alone, keeping the rest', () => {
    // A custom convertor with a very long regex; its path stays unshadowed.
    const routes = fastapiShadowingRoutes(
      discovery({ shadowRoutes: ['before', 'x'.repeat(5000), 'after'] }),
      'api/index'
    );
    expect(routes.map(r => r.src)).toEqual(['^/((?:before|after)/?)$']);
  });

  it('accounts for the src wrapper at the cap boundary', () => {
    // src is `^/((?:` + body + `)/?)$`, i.e. body length + 11; the cap is 4096,
    // so a 4085-char body just fits and a 4086-char one is dropped.
    const fits = fastapiShadowingRoutes(
      discovery({ shadowRoutes: ['a'.repeat(4085)] }),
      'app'
    );
    expect(fits).toHaveLength(1);
    expect(fits[0].src).toHaveLength(4096);
    expect(
      fastapiShadowingRoutes(
        discovery({ shadowRoutes: ['a'.repeat(4086)] }),
        'app'
      )
    ).toEqual([]);
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
          mountPrefixes: ['/spa'],
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
              '.*(?:^|[,\\s])(?:text/html|application/xhtml\\+xml)(?=[,;\\s]|$)(?![^,]*;\\s*q=0(?:\\.0+)?(?:[,;\\s]|$)).*',
          },
        ],
      },
    ]);
  });

  it('excludes a final segment with a file extension from the 200 fallback', () => {
    const [route] = fastapiFallbackRoutes(
      discovery({
        mountPrefixes: ['/spa'],
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
        mountPrefixes: ['/both'],
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
        mountPrefixes: ['/', '/assets', '/api/docs'],
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
        mountPrefixes: ['/v1.0'],
        fallbacks: [{ urlPath: '/v1.0', file: '404.html', status: 404 }],
      })
    );
    expect(route.src).toBe('^/v1\\.0/.*$');
    expect(route.dest).toBe('/v1.0/404.html');
  });

  it('escapes regex metacharacters in nested sibling sub-paths (guard)', () => {
    const [route] = fastapiFallbackRoutes(
      discovery({
        mountPrefixes: ['/app', '/app/a.b'],
        fallbacks: [{ urlPath: '/app', file: '404.html', status: 404 }],
      })
    );
    expect(route.src).toBe('^/app/(?!(?:a\\.b)(?:/|$)).*$');
  });

  it('skips a fallback route whose src would exceed the route cap', () => {
    // Many nested mounts grow the guard past the 4096 char src cap, so the
    // fallback route is skipped and the Lambda serves the fallback.
    const mountPrefixes = Array.from(
      { length: 400 },
      (_, i) => `/static_assets_dir_${i}`
    );
    const routes = fastapiFallbackRoutes(
      discovery({
        mountPrefixes,
        fallbacks: [{ urlPath: '/', file: 'index.html', status: 200 }],
      })
    );
    expect(routes).toEqual([]);
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

it('shadows both slash forms of an html=False directory index', () => {
  // html=False emits a plain directory body: both "/x/guide" and "/x/guide/"
  // reach the Lambda (the app 404s both), while the files below stay on the CDN.
  const [route] = fastapiShadowingRoutes(
    discovery({ shadowRoutes: ['x/guide'] }),
    'app'
  );
  const matches = new RegExp(route.src);
  expect(matches.test('/x/guide')).toBe(true);
  expect(matches.test('/x/guide/')).toBe(true);
  expect(matches.test('/x/guide/index.html')).toBe(false);
  expect(matches.test('/x/guide/app.js')).toBe(false);
});

it('shadows only the bare form of an html=True directory index', () => {
  // html=True and frontends emit a `(?!/)` body: only bare "/x/guide" (which
  // the app 307s) reaches the Lambda. "/x/guide/" and the files below it are
  // CDN index hits, matching the app's 200.
  const [route] = fastapiShadowingRoutes(
    discovery({ shadowRoutes: ['x/guide(?!/)'] }),
    'app'
  );
  const matches = new RegExp(route.src);
  expect(matches.test('/x/guide')).toBe(true);
  expect(matches.test('/x/guide/')).toBe(false);
  expect(matches.test('/x/guide/index.html')).toBe(false);
  expect(matches.test('/x/guide/app.js')).toBe(false);
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

it('does not shadow a root mount inside a mounted sub-app', () => {
  // A sub-app at /sub whose own root mount serves /sub/*. The shim emits the
  // bare mount root and the sub-app's route bodies but no subtree body, so the
  // root mount's files stay on the CDN.
  const [route] = fastapiShadowingRoutes(
    discovery({ shadowRoutes: ['sub', 'sub/hello'] }),
    'app'
  );
  const matches = new RegExp(route.src);
  // The bare mount root (307) and the sub-app's route reach the Lambda.
  expect(matches.test('/sub')).toBe(true);
  expect(matches.test('/sub/hello')).toBe(true);
  // The root mount's files stay on the CDN.
  expect(matches.test('/sub/data.txt')).toBe(false);
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

it('navigation Accept gate matches a complete media type, not a substring', () => {
  const [route] = fastapiFallbackRoutes(
    discovery({
      fallbacks: [{ urlPath: '/', file: 'index.html', status: 200 }],
    })
  );
  const accept = (route as { has?: { value: string }[] }).has?.[0]?.value ?? '';
  const matches = new RegExp(accept);
  // A complete text/html token is navigation.
  expect(matches.test('text/html')).toBe(true);
  expect(matches.test('application/json,text/html')).toBe(true);
  // A longer token that merely contains text/html is not.
  expect(matches.test('text/htmlx')).toBe(false);
  expect(matches.test('sometext/html')).toBe(false);
  expect(matches.test('text/html-sandboxed')).toBe(false);
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

  it('returns only the copied mounts when one fails', async () => {
    // A missing source dir makes fs.cp throw on the first mount; the second
    // still lands on the CDN and is the only mount returned.
    const good = source('good', { 'a.txt': 'GOOD' });
    const missing = path.join(root, 'does-not-exist');
    const copied = await copyFastAPIStaticMounts(
      [mount('/missing', missing, false), mount('/good', good, false)],
      out
    );
    expect(copied.map(m => m.urlPath)).toEqual(['/good']);
    expect(read('good/a.txt')).toBe('GOOD');
    expect(exists('missing/a.txt')).toBe(false);
  });

  it('returns an empty set when every mount fails', async () => {
    const copied = await copyFastAPIStaticMounts(
      [
        mount('/a', path.join(root, 'no-a'), false),
        mount('/b', path.join(root, 'no-b'), false),
      ],
      out
    );
    expect(copied).toEqual([]);
  });
});
