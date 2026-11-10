import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import {
  staticShadowRoutes,
  staticFallbackRoutes,
  staticDirectoryRedirects,
  type ShadowRoute,
  type StaticMount,
} from '../src/static-files';

const ACCEPT_RE =
  '.*(?:^|[,\\s])(?:text/html|application/xhtml\\+xml)(?=[,;\\s]|$)(?![^,]*;\\s*q=0(?:\\.0+)?(?:[,;\\s]|$)).*';

// Minimal StaticMount for tests that only need urlPath.
function mount(urlPath: string): StaticMount {
  return {
    urlPath,
    directory: '',
    fallback: null,
    frontend: false,
    html: false,
  };
}

// A copied mount carrying a fallback.
function withFallback(
  urlPath: string,
  file: string,
  status: number
): Pick<StaticMount, 'urlPath' | 'fallback'> {
  return { urlPath, fallback: { file, status } };
}

const allMethods = (...bodies: string[]): ShadowRoute[] =>
  bodies.map(body => ({ body, methods: null }));

describe('staticShadowRoutes', () => {
  it('returns [] when nothing is shadowed', () => {
    expect(staticShadowRoutes([], 'api/index')).toEqual([]);
  });

  it('ORs the (pre-escaped) shadow bodies into one group routed to the Lambda', () => {
    expect(
      staticShadowRoutes(
        allMethods('static/example\\.txt', 'items/(?:[0-9]+)'),
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
    const routes = staticShadowRoutes(allMethods(...bodies), 'api/index');

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
    const routes = staticShadowRoutes(
      allMethods('before', 'x'.repeat(5000), 'after'),
      'api/index'
    );
    expect(routes.map(r => r.src)).toEqual(['^/((?:before|after)/?)$']);
  });

  it('accounts for the src wrapper at the cap boundary', () => {
    // src is `^/((?:` + body + `)/?)$`, i.e. body length + 11; the cap is 4096,
    // so a 4085-char body just fits and a 4086-char one is dropped.
    const fits = staticShadowRoutes(allMethods('a'.repeat(4085)), 'app');
    expect(fits).toHaveLength(1);
    expect(fits[0].src).toHaveLength(4096);
    expect(staticShadowRoutes(allMethods('a'.repeat(4086)), 'app')).toEqual([]);
  });

  it('emits one CDN route per distinct method set, preserving per-group ordering', () => {
    // Two API-route shadows (GET+HEAD) and one subtree shadow (null = all
    // methods) must not be merged into a single src.
    const routes = staticShadowRoutes(
      [
        { body: 'items', methods: ['GET', 'HEAD'] },
        { body: 'other', methods: ['GET', 'HEAD'] },
        { body: 'api(?:/.*)?', methods: null },
      ],
      'api/index'
    );

    expect(routes).toHaveLength(2);
    const subtree = routes.find(r => r.src.includes('api'))!;
    expect(subtree.methods).toBeUndefined();
    const apiRoute = routes.find(r => r.src.includes('items'))!;
    expect(apiRoute.methods).toEqual(['GET', 'HEAD']);
    expect(apiRoute.src).toContain('items');
    expect(apiRoute.src).toContain('other');
  });

  it('has the correct shape for a method-scoped shadow', () => {
    expect(
      staticShadowRoutes([{ body: 'static', methods: ['GET'] }], 'api/index')
    ).toEqual([
      {
        // /static and /static/
        src: '^/((?:static)/?)$',
        dest: '/api/index',
        methods: ['GET'],
        transforms: [{ type: 'request.path', op: 'set', args: '/$1' }],
      },
    ]);
  });

  it('shadows both slash forms of a route declared with a trailing slash', () => {
    const [route] = staticShadowRoutes(allMethods('items'), 'api/index');
    const matches = new RegExp(route.src);
    expect(matches.test('/items')).toBe(true);
    expect(matches.test('/items/')).toBe(true);
    expect(matches.test('/items/5')).toBe(false);
  });

  it('shadows a sub-app subtree but not its nested CDN mounts', () => {
    const [route] = staticShadowRoutes(
      allMethods('api(?:/(?!(?:static)(?:/|$)).*)?'),
      'api/index'
    );
    const matches = new RegExp(route.src);
    expect(matches.test('/api')).toBe(true);
    expect(matches.test('/api/hello')).toBe(true);
    expect(matches.test('/api/hijack.txt')).toBe(true);
    expect(matches.test('/api/static/logo.png')).toBe(false);
  });

  it('shadows a colliding route under a sub-app but not its nested static sibling', () => {
    const [route] = staticShadowRoutes(
      allMethods('sub(?:/(?!(?:foo)(?:/|$)).*)?', 'sub/foo/bar'),
      'app'
    );
    const matches = new RegExp(route.src);
    expect(matches.test('/sub')).toBe(true);
    expect(matches.test('/sub/foo/bar')).toBe(true);
    expect(matches.test('/sub/foo/other.txt')).toBe(false);
    expect(matches.test('/sub/hello')).toBe(true);
  });

  it('shadows a mount root but not the files under it', () => {
    const [route] = staticShadowRoutes(allMethods('static'), 'app');
    const matches = new RegExp(route.src);
    expect(matches.test('/static')).toBe(true);
    expect(matches.test('/static/')).toBe(true);
    expect(matches.test('/static/index.html')).toBe(false);
    expect(matches.test('/statics')).toBe(false);
  });

  it('shadows both slash forms of a plain directory body', () => {
    const [route] = staticShadowRoutes(allMethods('x/guide'), 'app');
    const matches = new RegExp(route.src);
    expect(matches.test('/x/guide')).toBe(true);
    expect(matches.test('/x/guide/')).toBe(true);
    expect(matches.test('/x/guide/index.html')).toBe(false);
    expect(matches.test('/x/guide/app.js')).toBe(false);
  });

  it('shadows only the bare form of a `(?!/)` directory body', () => {
    const [route] = staticShadowRoutes(allMethods('x/guide(?!/)'), 'app');
    const matches = new RegExp(route.src);
    expect(matches.test('/x/guide')).toBe(true);
    expect(matches.test('/x/guide/')).toBe(false);
    expect(matches.test('/x/guide/index.html')).toBe(false);
    expect(matches.test('/x/guide/app.js')).toBe(false);
  });

  it('shadows a root-mounted sub-app subtree but not its nested CDN mounts', () => {
    const [route] = staticShadowRoutes(
      allMethods('(?!(?:static)(?:/|$)).*'),
      'app'
    );
    const matches = new RegExp(route.src);
    expect(matches.test('/')).toBe(true);
    expect(matches.test('/foo')).toBe(true);
    expect(matches.test('/foo/bar')).toBe(true);
    expect(matches.test('/static/logo.png')).toBe(false);
  });

  it('does not shadow a root mount inside a mounted sub-app', () => {
    const [route] = staticShadowRoutes(allMethods('sub', 'sub/hello'), 'app');
    const matches = new RegExp(route.src);
    expect(matches.test('/sub')).toBe(true);
    expect(matches.test('/sub/hello')).toBe(true);
    expect(matches.test('/sub/data.txt')).toBe(false);
  });
});

describe('staticFallbackRoutes', () => {
  it('returns [] when there are no fallbacks', () => {
    expect(staticFallbackRoutes([], [])).toEqual([]);
    expect(
      staticFallbackRoutes([mount('/static')], [mount('/static')])
    ).toEqual([]);
  });

  it('gates a 200 (index.html) fallback on an Accept navigation header', () => {
    expect(
      staticFallbackRoutes(
        [withFallback('/spa', 'index.html', 200)],
        [mount('/spa')]
      )
    ).toEqual([
      {
        src: '^/spa/(?!.*[^/.]\\.[^/]*$).*$',
        dest: '/spa/index.html',
        status: 200,
        check: true,
        methods: ['GET', 'HEAD'],
        has: [{ type: 'header', key: 'accept', value: ACCEPT_RE }],
      },
    ]);
  });

  it('excludes a final segment with a file extension from the 200 fallback', () => {
    const [route] = staticFallbackRoutes(
      [withFallback('/spa', 'index.html', 200)],
      [mount('/spa')]
    );
    const matches = new RegExp(route.src);
    expect(matches.test('/spa/route')).toBe(true);
    expect(matches.test('/spa/users/42')).toBe(true);
    expect(matches.test('/spa/app.js')).toBe(false);
    expect(matches.test('/spa/users/data.json')).toBe(false);
  });

  it('serves a 404 (404.html) fallback for every miss (no Accept gate)', () => {
    const [route] = staticFallbackRoutes(
      [withFallback('/both', '404.html', 404)],
      [mount('/both')]
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
    const [route] = staticFallbackRoutes(
      [withFallback('/', 'index.html', 200)],
      [mount('/'), mount('/assets'), mount('/api/docs')]
    );
    expect(route.src).toBe(
      '^/(?!(?:assets|api/docs)(?:/|$))(?!.*[^/.]\\.[^/]*$).*$'
    );
    expect(route.dest).toBe('/index.html');
  });

  it('excludes nested mounts that were discovered but not copied', () => {
    // The nested mount failed to copy, but it still owns its subtree at
    // runtime, so the parent's fallback must not cover it.
    const [route] = staticFallbackRoutes(
      [withFallback('/', '404.html', 404)],
      [mount('/'), mount('/failed')]
    );
    expect(route.src).toBe('^/(?!(?:failed)(?:/|$)).*$');
  });

  it('escapes regex metacharacters in the mount prefix (src only, not dest)', () => {
    const [route] = staticFallbackRoutes(
      [withFallback('/v1.0', '404.html', 404)],
      [mount('/v1.0')]
    );
    expect(route.src).toBe('^/v1\\.0/.*$');
    expect(route.dest).toBe('/v1.0/404.html');
  });

  it('escapes regex metacharacters in nested sibling sub-paths (guard)', () => {
    const [route] = staticFallbackRoutes(
      [withFallback('/app', '404.html', 404)],
      [mount('/app'), mount('/app/a.b')]
    );
    expect(route.src).toBe('^/app/(?!(?:a\\.b)(?:/|$)).*$');
  });

  it('skips a fallback route whose src would exceed the route cap', () => {
    const discovered = Array.from({ length: 400 }, (_, i) =>
      mount(`/static_assets_dir_${i}`)
    );
    expect(
      staticFallbackRoutes([withFallback('/', 'index.html', 200)], discovered)
    ).toEqual([]);
  });

  it('navigation Accept gate rejects an explicit q=0', () => {
    const [route] = staticFallbackRoutes(
      [withFallback('/', 'index.html', 200)],
      []
    );
    const accept = route.has?.[0]?.value as string;
    expect(new RegExp(accept).test('text/html;q=0')).toBe(false);
  });

  it('navigation Accept gate matches a complete media type, not a substring', () => {
    const [route] = staticFallbackRoutes(
      [withFallback('/', 'index.html', 200)],
      []
    );
    const matches = new RegExp(route.has?.[0]?.value as string);
    expect(matches.test('text/html')).toBe(true);
    expect(matches.test('application/json,text/html')).toBe(true);
    expect(matches.test('text/htmlx')).toBe(false);
    expect(matches.test('sometext/html')).toBe(false);
    expect(matches.test('text/html-sandboxed')).toBe(false);
  });

  describe('useFallbackForExtensionedPaths', () => {
    const opts = { useFallbackForExtensionedPaths: true };
    const spa = () =>
      staticFallbackRoutes(
        [withFallback('/spa', 'index.html', 200)],
        [mount('/spa')],
        opts
      );

    it('omits the extension guard from the 200 fallback src', () => {
      const [route] = spa();
      expect(route.src).toBe('^/spa/.*$');
    });

    it('matches extensioned paths', () => {
      const re = new RegExp(spa()[0].src);
      expect(re.test('/spa/route')).toBe(true);
      expect(re.test('/spa/app.js')).toBe(true);
      expect(re.test('/spa/data.json')).toBe(true);
    });

    it('still excludes nested sibling mounts', () => {
      const [route] = staticFallbackRoutes(
        [withFallback('/', 'index.html', 200)],
        [mount('/'), mount('/assets')],
        opts
      );
      expect(route.src).toBe('^/(?!(?:assets)(?:/|$)).*$');
    });

    it('still gates on the html Accept header', () => {
      const [route] = spa();
      expect(route.has).toEqual([
        { type: 'header', key: 'accept', value: ACCEPT_RE },
      ]);
    });
  });
});

// Redirect routes sit after shadow routes so a prior app route on a bare
// directory path wins over the redirect.
describe('staticDirectoryRedirects', () => {
  const tmp = (name: string) =>
    path.join(tmpdir(), `static-files-${name}-${Date.now()}`);

  it('adds bare directory redirect routes for frontend mounts', () => {
    // A directory name that differs from the URL prefix confirms redirect
    // src/dest are URL-based, not filesystem-path-based.
    const distDir = tmp('dist');
    fs.mkdirSync(path.join(distDir, 'guide', 'section'), { recursive: true });
    fs.writeFileSync(path.join(distDir, 'guide', 'index.html'), '');
    fs.writeFileSync(path.join(distDir, 'guide', 'section', 'index.html'), '');
    try {
      const redirects = staticDirectoryRedirects([
        {
          urlPath: '/frontend',
          directory: distDir,
          fallback: null,
          frontend: true,
          html: false,
        },
      ]);
      expect(redirects).toEqual([
        {
          src: '^/((?:frontend/guide|frontend/guide/section))$',
          dest: '/$1/',
          status: 307,
          methods: ['GET', 'HEAD'],
        },
      ]);
    } finally {
      fs.rmSync(distDir, { recursive: true, force: true });
    }
  });

  // A higher-priority mount owns every URL under its prefix, so a
  // lower-priority mount's index.html at such a URL gets no redirect.
  it('omits redirects for directories covered by a higher-priority mount', () => {
    const outerDir = tmp('overlap');
    fs.mkdirSync(path.join(outerDir, 'inner', 'x'), { recursive: true });
    fs.mkdirSync(path.join(outerDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(outerDir, 'inner', 'x', 'index.html'), '');
    fs.writeFileSync(path.join(outerDir, 'docs', 'index.html'), '');
    try {
      const redirects = staticDirectoryRedirects([
        {
          urlPath: '/overlap/inner',
          directory: '/work/inner',
          fallback: null,
          frontend: false,
          html: false,
        },
        {
          urlPath: '/overlap',
          directory: outerDir,
          fallback: null,
          frontend: false,
          html: true,
        },
      ]);
      const srcs = redirects.map(r => r.src).join('\n');
      expect(srcs).toMatch(/overlap\/docs/);
      expect(srcs).not.toMatch(/overlap\/inner/);
    } finally {
      fs.rmSync(outerDir, { recursive: true, force: true });
    }
  });

  // Frontends are lowest copy priority regardless of position, so a plain
  // mount listed after a frontend still suppresses the frontend's redirects.
  it('omits frontend redirects under a plain mount listed after it', () => {
    const feDir = tmp('fe-overlap');
    fs.mkdirSync(path.join(feDir, 'assets', 'img'), { recursive: true });
    fs.writeFileSync(path.join(feDir, 'assets', 'img', 'index.html'), '');
    try {
      const redirects = staticDirectoryRedirects([
        {
          urlPath: '/',
          directory: feDir,
          fallback: { file: 'index.html', status: 200 },
          frontend: true,
          html: true,
        },
        {
          urlPath: '/assets',
          directory: '/work/assets',
          fallback: null,
          frontend: false,
          html: false,
        },
      ]);
      expect(redirects.map(r => r.src).join('\n')).not.toMatch(/assets\/img/);
    } finally {
      fs.rmSync(feDir, { recursive: true, force: true });
    }
  });

  it('adds redirects for plain html mounts only where index.html exists', () => {
    const distDir = tmp('html');
    fs.mkdirSync(path.join(distDir, 'docs'), { recursive: true });
    fs.mkdirSync(path.join(distDir, 'empty'), { recursive: true });
    fs.writeFileSync(path.join(distDir, 'index.html'), '');
    fs.writeFileSync(path.join(distDir, 'docs', 'index.html'), '');
    try {
      const redirects = staticDirectoryRedirects([
        {
          urlPath: '/site',
          directory: distDir,
          fallback: null,
          frontend: false,
          html: true,
        },
      ]);
      expect(redirects).toEqual([
        {
          src: '^/((?:site|site/docs))$',
          dest: '/$1/',
          status: 307,
          methods: ['GET', 'HEAD'],
        },
      ]);
    } finally {
      fs.rmSync(distDir, { recursive: true, force: true });
    }
  });

  it('emits no redirects for plain non-html mounts', () => {
    expect(staticDirectoryRedirects([mount('/static')])).toEqual([]);
  });

  it('skips a mount whose directory cannot be walked', () => {
    expect(
      staticDirectoryRedirects([
        { ...mount('/site'), directory: tmp('missing'), html: true },
      ])
    ).toEqual([]);
  });
});
