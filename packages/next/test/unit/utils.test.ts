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
} from '../../src/utils';
import { FileFsRef, FileRef } from '@vercel/build-utils';
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
      remotePatterns: undefined,
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
      remotePatterns: undefined,
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
      remotePatterns: undefined,
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
