import path from 'path';
import os from 'os';
import {
  excludeFiles,
  validateEntrypoint,
  normalizePackageJson,
  getImagesConfig,
  getNextConfig,
  getServerlessPages,
  normalizePrefetches,
  getMaxUncompressedLambdaSize,
  getGroupMaxUncompressedLambdaSize,
  isLargeFunctionsEnabled,
  LARGE_FUNCTIONS_ENV,
  getPageLambdaGroups,
  detectLambdaLimitExceeding,
  type LambdaGroup,
  type PseudoFile,
} from '../../src/utils';
import { FileFsRef, FileRef, type Config } from '@vercel/build-utils';
import { genDir } from '../utils';

describe('getNextConfig', () => {
  const workPath = path.join(__dirname, 'fixtures', '00-config');
  const entryPath = path.join(workPath, 'entry');

  it('should find entry file', async () => {
    const file = await getNextConfig(workPath, entryPath);
    expect(file).toMatchSnapshot();
  });

  it('should find work file second', async () => {
    const file = await getNextConfig(workPath, '/');
    expect(file).toMatchSnapshot();
  });

  it('return null on nothing', async () => {
    const file = await getNextConfig('/', '/');
    expect(file).toMatchSnapshot();
  });
});

describe('getImagesConfig', () => {
  it('should return undefined when undefined config', async () => {
    const result = await getImagesConfig(undefined);
    expect(result).toBeUndefined();
  });

  it('should return undefined when null config', async () => {
    const result = await getImagesConfig(null);
    expect(result).toBeUndefined();
  });

  it('should return undefined when empty object config', async () => {
    const result = await getImagesConfig({ images: {} });
    expect(result).toBeUndefined();
  });

  it('should return pass-through props when loader is default and unoptimized undefined', async () => {
    const images = {
      loader: 'default',
      domains: ['example.com'],
      sizes: [512, 1024],
      qualities: [25, 50, 75],
      remotePatterns: undefined,
      localPatterns: [{ search: '' }],
      formats: ['image/webp'],
      minimumCacheTTL: 60,
      dangerouslyAllowSVG: false,
      contentSecurityPolicy: undefined,
      contentDispositionType: undefined,
    };
    const result = await getImagesConfig({ images });
    expect(result).toEqual({
      domains: ['example.com'],
      sizes: [512, 1024],
      qualities: [25, 50, 75],
      remotePatterns: undefined,
      localPatterns: [{ search: '' }],
      formats: ['image/webp'],
      minimumCacheTTL: 60,
      dangerouslyAllowSVG: false,
      contentSecurityPolicy: undefined,
      contentDispositionType: undefined,
    });
  });

  it('should return pass-through props when loader is default and unoptimized false', async () => {
    const images = {
      unoptimized: false,
      loader: 'default',
      domains: ['example.com'],
      sizes: [512, 1024],
      remotePatterns: undefined,
      localPatterns: [{ pathname: '^/assets/img.png$', search: '' }],
      formats: ['image/webp'],
      minimumCacheTTL: 60,
      dangerouslyAllowSVG: false,
      contentSecurityPolicy: undefined,
      contentDispositionType: 'attachment',
    };
    const result = await getImagesConfig({ images });
    expect(result).toEqual({
      domains: ['example.com'],
      sizes: [512, 1024],
      remotePatterns: undefined,
      localPatterns: [{ pathname: '^/assets/img.png$', search: '' }],
      formats: ['image/webp'],
      minimumCacheTTL: 60,
      dangerouslyAllowSVG: false,
      contentSecurityPolicy: undefined,
      contentDispositionType: 'attachment',
    });
  });

  it('return return undefined when loader is default and unoptimized true', async () => {
    const images = {
      unoptimized: true,
      loader: 'default',
      domains: ['example.com'],
      sizes: [512, 1024],
      qualities: [70, 80, 90],
      remotePatterns: undefined,
      localPatterns: [{ search: '' }],
      formats: ['image/webp'],
      minimumCacheTTL: 60,
      dangerouslyAllowSVG: false,
      contentSecurityPolicy: undefined,
      contentDispositionType: undefined,
    };
    const result = await getImagesConfig({ images });
    expect(result).toBeUndefined();
  });
});

describe('excludeFiles', () => {
  it('should exclude files', () => {
    const files = {
      'pages/index.js': new FileRef({ digest: 'index' }),
      'package.json': new FileRef({ digest: 'package' }),
      'package-lock.json': new FileRef({ digest: 'package-lock' }),
    };
    const result = excludeFiles(
      files,
      filePath => filePath === 'package-lock.json'
    );
    expect(result['pages/index.js']).toBeDefined();
    expect(result['package.json']).toBeDefined();
    expect(result['package-lock.json']).toBeUndefined();
  });
});

describe('validateEntrypoint', () => {
  it('should allow package.json', () => {
    expect(validateEntrypoint('package.json')).toBeUndefined();
  });
  it('should allow nested package.json', () => {
    expect(validateEntrypoint('frontend/package.json')).toBeUndefined();
  });
  it('should allow next.config.js', () => {
    expect(validateEntrypoint('next.config.js')).toBeUndefined();
  });
  it('should allow nested next.config.js', () => {
    expect(validateEntrypoint('frontend/next.config.js')).toBeUndefined();
  });
  it('should not allow pages/index.js', () => {
    expect(() => validateEntrypoint('pages/index.js')).toThrow();
  });
});

describe('normalizePackageJson', () => {
  it('should work without a package.json being supplied', () => {
    const result = normalizePackageJson();
    expect(result).toEqual({
      dependencies: {
        'next-server': 'v7.0.2-canary.49',
        react: 'latest',
        'react-dom': 'latest',
      },
      devDependencies: {
        next: 'v7.0.2-canary.49',
      },
      scripts: {
        'now-build':
          'NODE_OPTIONS=--max_old_space_size=3000 next build --lambdas',
      },
    });
  });

  it('should work with a package.json being supplied', () => {
    const defaultPackage = {
      dependencies: {
        'next-server': 'v7.0.2-canary.49',
        react: 'latest',
        'react-dom': 'latest',
      },
      devDependencies: {
        next: 'v7.0.2-canary.49',
      },
      scripts: {
        'now-build': 'next build',
      },
    };
    const result = normalizePackageJson(defaultPackage);
    expect(result).toEqual({
      dependencies: {
        'next-server': 'v7.0.2-canary.49',
        react: 'latest',
        'react-dom': 'latest',
      },
      devDependencies: {
        next: 'v7.0.2-canary.49',
      },
      scripts: {
        'now-build':
          'NODE_OPTIONS=--max_old_space_size=3000 next build --lambdas',
      },
    });
  });

  it('should force next@canary to be a devDependency', () => {
    const defaultPackage = {
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
        next: 'latest',
      },
    };
    const result = normalizePackageJson(defaultPackage);
    expect(result).toEqual({
      dependencies: {
        'next-server': 'v7.0.2-canary.49',
        react: 'latest',
        'react-dom': 'latest',
      },
      devDependencies: {
        next: 'v7.0.2-canary.49',
      },
      scripts: {
        'now-build':
          'NODE_OPTIONS=--max_old_space_size=3000 next build --lambdas',
      },
    });
  });

  it('should force next-server@canary to be a dependency', () => {
    const defaultPackage = {
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
        next: 'latest',
      },
    };
    const result = normalizePackageJson(defaultPackage);
    expect(result).toEqual({
      dependencies: {
        'next-server': 'v7.0.2-canary.49',
        react: 'latest',
        'react-dom': 'latest',
      },
      devDependencies: {
        next: 'v7.0.2-canary.49',
      },
      scripts: {
        'now-build':
          'NODE_OPTIONS=--max_old_space_size=3000 next build --lambdas',
      },
    });
  });

  it('should force now-build script', () => {
    const defaultPackage = {
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
        next: 'latest',
      },
    };
    const result = normalizePackageJson(defaultPackage);
    expect(result).toEqual({
      dependencies: {
        'next-server': 'v7.0.2-canary.49',
        react: 'latest',
        'react-dom': 'latest',
      },
      devDependencies: {
        next: 'v7.0.2-canary.49',
      },
      scripts: {
        'now-build':
          'NODE_OPTIONS=--max_old_space_size=3000 next build --lambdas',
      },
    });
  });

  // https://github.com/vercel/next.js/issues/5700
  it('should normalize user report vercel/next.js#5700 correctly', () => {
    const defaultPackage = {
      version: '1.0.0',
      scripts: {
        dev: 'next',
        build: 'next build',
        start: 'next start',
        test: "xo && stylelint './pages/**/*.js' && jest",
      },
      main: 'pages/index.js',
      license: 'MIT',
      devDependencies: {
        'babel-plugin-styled-components': '^1.8.0',
        'eslint-config-xo-react': '^0.17.0',
        'eslint-plugin-react': '^7.11.1',
        jest: '^23.6.0',
        'jest-styled-components': '^6.3.1',
        'react-test-renderer': '^16.6.3',
        stylelint: '^9.8.0',
        'stylelint-config-recommended': '^2.1.0',
        'stylelint-config-styled-components': '^0.1.1',
        'stylelint-processor-styled-components': '^1.5.1',
        xo: '^0.23.0',
      },
      dependencies: {
        consola: '^2.2.6',
        fontfaceobserver: '^2.0.13',
        next: '^7.0.2',
        react: '^16.6.3',
        'react-dom': '^16.6.3',
        'styled-components': '^4.1.1',
      },
      xo: {
        extends: 'xo-react',
        envs: 'browser',
        esnext: true,
        ignores: [
          'test',
          'pages/_document.js',
          'pages/index.js',
          'pages/home.js',
        ],
        rules: {
          'react/no-unescaped-entities': null,
        },
      },
      jest: {
        testEnvironment: 'node',
      },
    };
    const result = normalizePackageJson(defaultPackage);
    expect(result).toEqual({
      version: '1.0.0',
      scripts: {
        dev: 'next',
        build: 'next build',
        'now-build':
          'NODE_OPTIONS=--max_old_space_size=3000 next build --lambdas',
        start: 'next start',
        test: "xo && stylelint './pages/**/*.js' && jest",
      },
      main: 'pages/index.js',
      license: 'MIT',
      devDependencies: {
        'babel-plugin-styled-components': '^1.8.0',
        'eslint-config-xo-react': '^0.17.0',
        'eslint-plugin-react': '^7.11.1',
        jest: '^23.6.0',
        'jest-styled-components': '^6.3.1',
        'react-test-renderer': '^16.6.3',
        stylelint: '^9.8.0',
        'stylelint-config-recommended': '^2.1.0',
        'stylelint-config-styled-components': '^0.1.1',
        'stylelint-processor-styled-components': '^1.5.1',
        next: 'v7.0.2-canary.49',
        'next-server': undefined,
        xo: '^0.23.0',
        consola: '^2.2.6',
        fontfaceobserver: '^2.0.13',
        'styled-components': '^4.1.1',
      },
      dependencies: {
        'next-server': 'v7.0.2-canary.49',
        react: '^16.6.3',
        'react-dom': '^16.6.3',
      },
      xo: {
        extends: 'xo-react',
        envs: 'browser',
        esnext: true,
        ignores: [
          'test',
          'pages/_document.js',
          'pages/index.js',
          'pages/home.js',
        ],
        rules: {
          'react/no-unescaped-entities': null,
        },
      },
      jest: {
        testEnvironment: 'node',
      },
    });
  });
});

describe('getServerlessPages', () => {
  it('should gather all pages correctly', async () => {
    const dir = await genDir({
      '.next/server/pages/_app.js': 'test',
      '.next/server/pages/_error.js': 'test',
      '.next/server/app/page.js': 'test',
      '.next/server/app/favicon.ico/route.js': 'test',
    });

    const { pages, appPaths } = await getServerlessPages({
      pagesDir: path.resolve(path.join(dir, '.next/server/pages')),
      entryPath: os.tmpdir(),
      outputDirectory: os.tmpdir(),
      appPathRoutesManifest: {
        '/_not-found': '/_not-found',
        '/favicon.ico/route': '/favicon.ico',
        '/page': '/',
      },
    });

    expect(Object.keys(pages)).toEqual(['_app.js', '_error.js']);
    expect(Object.keys(appPaths)).toEqual(['favicon.ico.js', 'index.js']);
  });
});

describe('normalizePrefetches', () => {
  it('should properly prefix prefetches with `__`', async () => {
    const dummyFile = new FileFsRef({ fsPath: __dirname });

    const appRscPrefetches = {
      'index.prefetch.rsc': dummyFile,
      'index/index.prefetch.rsc': dummyFile,
      'foo.prefetch.rsc': dummyFile,
      'foo/index.prefetch.rsc': dummyFile,
      'foo/bar/baz.prefetch.rsc': dummyFile,
    };

    const updatedPrefetches = normalizePrefetches(appRscPrefetches);

    expect(Object.keys(updatedPrefetches)).toEqual([
      '__index.prefetch.rsc',
      'index/index.prefetch.rsc',
      'foo.prefetch.rsc',
      'foo/index.prefetch.rsc',
      'foo/bar/baz.prefetch.rsc',
    ]);
  });
});

describe('getMaxUncompressedLambdaSize', () => {
  it.each(['bun1.x', 'bun2.x'])('should return 150 MiB for %s', runtime => {
    const size = getMaxUncompressedLambdaSize(runtime);
    expect(size).toBe(150 * 1024 * 1024);
  });

  it.each([
    'provided.al2023',
    'nodejs22.x',
  ])('should return 250 MiB for %s runtime', runtime => {
    const size = getMaxUncompressedLambdaSize(runtime);
    expect(size).toBe(250 * 1024 * 1024);
  });

  it.each([
    'bun1.x',
    'provided.al2023',
    'nodejs22.x',
  ])('should use override for %s', runtime => {
    const override = 100 * 1024 * 1024;
    process.env.MAX_UNCOMPRESSED_LAMBDA_SIZE = override.toString();
    const size = getMaxUncompressedLambdaSize(runtime);
    expect(size).toBe(override);
    delete process.env.MAX_UNCOMPRESSED_LAMBDA_SIZE;
  });
});

const MiB = 1024 * 1024;

function makePseudoFile(uncompressedSize: number): PseudoFile {
  return {
    file: undefined as unknown as FileFsRef,
    isSymlink: false,
    crc32: 0,
    uncompressedSize,
  };
}

/**
 * Runs `getPageLambdaGroups` over synthetic pages where each page's entire
 * uncompressed size is carried by its compressed page entry (no shared traces),
 * so the standalone size of a route equals the number passed in.
 */
function groupPagesBySize(
  pageSizes: Record<string, number>,
  runtime = 'nodejs22.x'
) {
  const pages = Object.keys(pageSizes);
  const compressedPages: Record<string, PseudoFile> = {};
  for (const page of pages) {
    compressedPages[page] = makePseudoFile(pageSizes[page]);
  }

  return getPageLambdaGroups({
    entryPath: os.tmpdir(),
    config: {} as Config,
    functionsConfigManifest: undefined,
    pages,
    prerenderRoutes: new Set(),
    experimentalPPRRoutes: undefined,
    pageTraces: {},
    compressedPages,
    tracedPseudoLayer: {},
    initialPseudoLayer: { pseudoLayer: {}, pseudoLayerBytes: 0 },
    initialPseudoLayerUncompressed: 0,
    internalPages: [],
    nodeVersion: { runtime },
  });
}

describe('getGroupMaxUncompressedLambdaSize', () => {
  it('returns the default per-runtime limit for normal groups', () => {
    expect(getGroupMaxUncompressedLambdaSize('nodejs22.x', false)).toBe(
      250 * MiB
    );
    expect(getGroupMaxUncompressedLambdaSize('nodejs22.x', undefined)).toBe(
      250 * MiB
    );
    expect(getGroupMaxUncompressedLambdaSize('bun1.x', false)).toBe(150 * MiB);
  });

  it('returns the 5 GiB ceiling for large-function groups', () => {
    expect(getGroupMaxUncompressedLambdaSize('nodejs22.x', true)).toBe(
      5 * 1024 * MiB
    );
    expect(getGroupMaxUncompressedLambdaSize('bun1.x', true)).toBe(
      5 * 1024 * MiB
    );
  });
});

describe('isLargeFunctionsEnabled', () => {
  afterEach(() => {
    delete process.env[LARGE_FUNCTIONS_ENV];
  });

  it('defaults to disabled', () => {
    delete process.env[LARGE_FUNCTIONS_ENV];
    expect(isLargeFunctionsEnabled()).toBe(false);
  });

  it('is enabled when the env var is set', () => {
    process.env[LARGE_FUNCTIONS_ENV] = '1';
    expect(isLargeFunctionsEnabled()).toBe(true);
  });
});

describe('getPageLambdaGroups large functions', () => {
  afterEach(() => {
    delete process.env[LARGE_FUNCTIONS_ENV];
  });

  it('keeps existing bundling unchanged when the flag is disabled', async () => {
    delete process.env[LARGE_FUNCTIONS_ENV];

    const groups = await groupPagesBySize({
      'big-a.js': 300 * MiB,
      'small-1.js': 10 * MiB,
      'small-2.js': 10 * MiB,
      'big-b.js': 300 * MiB,
    });

    // No group is flagged large, and the two oversized routes are NOT merged
    // together — each oversized route gets its own (over-limit) group, exactly
    // as before this feature existed.
    expect(groups.every(g => !g.isLargeFunctions)).toBe(true);
    const byPages = groups.map(g => g.pages.slice().sort()).sort();
    expect(byPages).toEqual([
      ['big-a.js'],
      ['big-b.js'],
      ['small-1.js', 'small-2.js'],
    ]);
  });

  it('emits each over-budget route as its own individual large function', async () => {
    process.env[LARGE_FUNCTIONS_ENV] = '1';

    const groups = await groupPagesBySize({
      'big-a.js': 300 * MiB,
      'small-1.js': 10 * MiB,
      'small-2.js': 10 * MiB,
      'big-b.js': 300 * MiB,
    });

    // Two individual large functions (one page each, never bundled together)
    // plus one normal group holding both small routes.
    expect(groups).toHaveLength(3);

    const large = groups.filter(g => g.isLargeFunctions);
    const normal = groups.filter(g => !g.isLargeFunctions);

    expect(large.map(g => g.pages.slice().sort()).sort()).toEqual([
      ['big-a.js'],
      ['big-b.js'],
    ]);
    expect(normal).toHaveLength(1);
    expect(normal[0].pages.slice().sort()).toEqual([
      'small-1.js',
      'small-2.js',
    ]);
  });

  it('does not bundle large routes together even when they would fit the ceiling', async () => {
    process.env[LARGE_FUNCTIONS_ENV] = '1';

    const groups = await groupPagesBySize({
      // Together only 600 MiB (well under the 5 GiB ceiling), yet each large
      // route is still emitted as its own function rather than bundled.
      'big-a.js': 300 * MiB,
      'big-b.js': 300 * MiB,
    });

    expect(groups).toHaveLength(2);
    expect(groups.every(g => g.isLargeFunctions)).toBe(true);
    expect(groups.every(g => g.pages.length === 1)).toBe(true);
  });

  it('never mixes large and normal routes in the same group', async () => {
    process.env[LARGE_FUNCTIONS_ENV] = '1';

    const groups = await groupPagesBySize({
      'big.js': 260 * MiB,
      'small.js': 50 * MiB,
    });

    expect(groups).toHaveLength(2);
    const large = groups.find(g => g.isLargeFunctions);
    const normal = groups.find(g => !g.isLargeFunctions);
    expect(large?.pages).toEqual(['big.js']);
    expect(normal?.pages).toEqual(['small.js']);
  });

  it('treats a route within the normal packing budget as normal', async () => {
    process.env[LARGE_FUNCTIONS_ENV] = '1';

    const groups = await groupPagesBySize({
      // 200 MiB is under the 225 MiB budget (250 MiB limit − 25 MiB reserved).
      'within-budget.js': 200 * MiB,
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].isLargeFunctions).toBe(false);
  });

  it('treats a route over the packing budget but under the hard limit as large', async () => {
    process.env[LARGE_FUNCTIONS_ENV] = '1';

    const groups = await groupPagesBySize({
      // 240 MiB is under the 250 MiB limit but over the 225 MiB packing budget,
      // so it cannot be guaranteed to fit a normal function (once post-build
      // files are added) and is treated as large.
      'over-budget.js': 240 * MiB,
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].isLargeFunctions).toBe(true);
  });
});

describe('detectLambdaLimitExceeding with large functions', () => {
  function makeGroup(opts: {
    pages: string[];
    uncompressed: number;
    isLargeFunctions: boolean;
  }): LambdaGroup {
    return {
      pages: opts.pages,
      isPrerenders: false,
      isExperimentalPPR: false,
      isApiLambda: false,
      isLargeFunctions: opts.isLargeFunctions,
      pseudoLayer: {},
      pseudoLayerBytes: 0,
      pseudoLayerUncompressedBytes: opts.uncompressed,
    };
  }

  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function loggedOutput(): string {
    return logSpy.mock.calls.map(call => call.join(' ')).join('\n');
  }

  it('does not warn for a large-function group within the 5 GiB ceiling', async () => {
    const size = 1 * 1024 * MiB; // 1 GiB — over 250 MiB but under 5 GiB
    await detectLambdaLimitExceeding(
      [
        makeGroup({
          pages: ['big.js'],
          uncompressed: size,
          isLargeFunctions: true,
        }),
      ],
      { 'big.js': makePseudoFile(size) },
      'nodejs22.x'
    );
    expect(loggedOutput()).not.toContain('size was exceeded');
  });

  it('warns for a normal group of the same size', async () => {
    const size = 1 * 1024 * MiB; // 1 GiB — over the 250 MiB default limit
    await detectLambdaLimitExceeding(
      [
        makeGroup({
          pages: ['big.js'],
          uncompressed: size,
          isLargeFunctions: false,
        }),
      ],
      { 'big.js': makePseudoFile(size) },
      'nodejs22.x'
    );
    expect(loggedOutput()).toContain('size was exceeded');
  });
});
