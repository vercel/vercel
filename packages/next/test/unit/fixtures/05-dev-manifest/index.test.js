const path = require('path');
const { FileFsRef } = require('@vercel/build-utils');
const { build, getDevManifest } = require('../../../../dist');

vi.setConfig({ testTimeout: 360000, hookTimeout: 360000 });

afterEach(() => {
  vi.unstubAllEnvs();
});

it.each([
  ['', ''],
  ['', '/docs'],
  ['05-dev-manifest', ''],
])('matches real build artifacts for build root "%s" and basePath "%s"', async (buildRoot, basePath) => {
  vi.stubEnv('NEXT_MANIFEST_BASE_PATH', basePath);
  const workPath = buildRoot ? path.dirname(__dirname) : __dirname;
  const entrypoint = path.posix.join(buildRoot, 'package.json');
  const sources = [
    ['app/route.api.js', 'index', '/'],
    ['app/(internal)/jobs/route.api.js', 'jobs', '/jobs'],
    ['app/nested/index/route.api.js', 'nested/index', '/nested/index'],
    ['pages/api/index.api.js', 'api', '/api'],
    ['pages/api/jobs/index.api.js', 'api/jobs', '/api/jobs'],
    [
      'app/edge/index/route.api.js',
      basePath ? 'edge' : 'edge/index',
      '/edge/index',
      true,
    ],
  ];
  const files = [
    'package.json',
    'next.config.js',
    ...sources.map(([source]) => source),
  ];
  const { output } = await build({
    config: {
      installCommand: 'pnpm install --ignore-workspace --lockfile=false',
    },
    entrypoint,
    files: Object.fromEntries(
      files.map(file => [
        path.posix.join(buildRoot, file),
        new FileFsRef({ fsPath: path.join(__dirname, file) }),
      ])
    ),
    meta: { skipDownload: true },
    repoRootPath: __dirname,
    workPath,
  });

  const options = {
    workPath,
    build: { src: entrypoint, use: '@vercel/next' },
    files: sources.map(([source]) => path.posix.join(buildRoot, source)),
    // The fixture's vercel.json must not override this authoritative scope.
    config: { functions: {} },
    env: { ...process.env, NODE_ENV: 'development' },
  };
  const manifest = await getDevManifest(options);
  expect(manifest).toEqual({
    functions: sources.map(([source, outputName, pathname, edge]) => ({
      sourceFile: path.posix.join(buildRoot, source),
      outputPath: path.posix.join(
        '.',
        edge ? '' : buildRoot,
        basePath,
        outputName
      ),
      invocation: {
        type: 'http',
        pathname: `${basePath}${pathname === '/' ? '' : pathname}` || '/',
      },
    })),
    matchedFunctionPatterns: [],
  });
  for (const fn of manifest.functions) {
    expect(output[fn.outputPath]?.type, fn.outputPath).toBe(
      fn.sourceFile.includes('/edge/') ? 'EdgeFunction' : 'Lambda'
    );
  }

  const scheduledSource = path.posix.join(buildRoot, 'app/route.api.js');
  const scheduled = await getDevManifest({
    ...options,
    config: {
      functions: {
        [scheduledSource]: {
          experimentalTriggers: [{ type: 'schedule/v1beta' }],
        },
      },
    },
  });
  expect(scheduled.functions[0]).toEqual({
    ...manifest.functions[0],
    experimentalTriggers: [{ type: 'schedule/v1beta' }],
  });
  expect(scheduled.matchedFunctionPatterns).toEqual([scheduledSource]);
  expect(scheduled).not.toHaveProperty('schedules');
});

it.each([
  [true, false, ''],
  [true, false, '/docs'],
  [true, false, '/docs.v1'],
  [true, false, '/.well-known'],
  [false, false, '/docs'],
  [true, true, '/docs'],
  [false, true, '/docs'],
])('uses installed Next redirect rules for trailingSlash=%s, skip=%s, basePath=%s', async (trailingSlash, skipTrailingSlashRedirect, basePath) => {
  vi.stubEnv('NEXT_MANIFEST_BASE_PATH', basePath);
  vi.stubEnv('NEXT_MANIFEST_TRAILING_SLASH', trailingSlash ? '1' : '0');
  vi.stubEnv(
    'NEXT_MANIFEST_SKIP_SLASH_REDIRECT',
    skipTrailingSlashRedirect ? '1' : '0'
  );
  const {
    default: loadCustomRoutes,
  } = require('next/dist/lib/load-custom-routes');
  const {
    getPathMatch,
  } = require('next/dist/shared/lib/router/utils/path-match');
  const {
    prepareDestination,
  } = require('next/dist/shared/lib/router/utils/prepare-destination');
  const { redirects } = await loadCustomRoutes({
    basePath,
    trailingSlash,
    skipTrailingSlashRedirect,
  });
  const sources = [
    ['app/route.api.js', 'index', '/'],
    ['app/(internal)/jobs/route.api.js', 'jobs', '/jobs'],
    ['pages/api/jobs/index.api.js', 'api/jobs', '/api/jobs'],
  ];
  const manifest = await getDevManifest({
    workPath: __dirname,
    build: { src: 'package.json', use: '@vercel/next' },
    files: sources.map(([source]) => source),
    config: { functions: {} },
    env: { ...process.env, NODE_ENV: 'development' },
  });
  expect(manifest.functions).toEqual(
    sources.map(([sourceFile, outputName, routePathname]) => {
      let pathname =
        `${basePath}${routePathname === '/' ? '' : routePathname}` || '/';
      for (const redirect of redirects) {
        const params = getPathMatch(redirect.source, { strict: true })(
          pathname
        );
        if (params) {
          pathname = prepareDestination({
            destination: redirect.destination,
            params,
            query: {},
            appendParamsToQuery: false,
          }).newUrl;
          break;
        }
      }
      return {
        sourceFile,
        outputPath: path.posix.join('.', basePath, outputName),
        invocation: { type: 'http', pathname },
      };
    })
  );
});
