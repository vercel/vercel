import { detectFileSystemAPI } from '../src/detect-file-system-api';

describe('Test `detectFileSystemAPI`', () => {
  it('should error when builds in vercel.json', async () => {
    const vercelConfig = {
      builds: [{ use: '@vercel/node', src: 'api/**/*.js' }],
    };
    const files = {
      'vercel.json': JSON.stringify(vercelConfig),
      'api/foo.js': 'console.log("foo")',
    };
    const result = await detectFileSystemAPI({
      files,
      projectSettings: {},
      builders: vercelConfig.builds,
      vercelConfig,
      pkg: null,
      tag: '',
      enableFlag: true,
    });
    expect(result).toEqual({
      fsApiBuilder: null,
      reason:
        'Detected `builds` in vercel.json. Please remove it in favor of CLI plugins.',
      metadata: { hasDotOutput: false, hasMiddleware: false, plugins: [] },
    });
  });

  it('should error when functions.runtimes in vercel.json', async () => {
    const vercelConfig = {
      functions: {
        'api/**/*.rs': {
          runtime: 'vercel-rust@latest',
        },
      },
    };
    const files = {
      'vercel.json': JSON.stringify(vercelConfig),
      'api/foo.rs': 'println!("foo")',
    };
    const result = await detectFileSystemAPI({
      files,
      projectSettings: {},
      builders: [],
      vercelConfig,
      pkg: null,
      tag: '',
      enableFlag: true,
    });
    expect(result).toEqual({
      fsApiBuilder: null,
      reason:
        'Detected `functions.runtime` in vercel.json. Please remove it in favor of CLI plugins.',
      metadata: { hasDotOutput: false, hasMiddleware: false, plugins: [] },
    });
  });

  it('should error when HUGO_VERSION env var used', async () => {
    process.env.HUGO_VERSION = 'v0.58.2';
    const files = { 'foo.html': '<h1>Foo</h1>' };
    const result = await detectFileSystemAPI({
      files,
      projectSettings: {},
      builders: [],
      vercelConfig: null,
      pkg: null,
      tag: '',
      enableFlag: true,
    });
    expect(result).toEqual({
      fsApiBuilder: null,
      reason: 'Detected `HUGO_VERSION` environment variable. Please remove it.',
      metadata: { hasDotOutput: false, hasMiddleware: false, plugins: [] },
    });
    delete process.env.HUGO_VERSION;
  });

  it('should error when ZOLA_VERSION env var used', async () => {
    process.env.ZOLA_VERSION = 'v0.0.1';
    const files = { 'foo.html': '<h1>Foo</h1>' };
    const result = await detectFileSystemAPI({
      files,
      projectSettings: {},
      builders: [],
      vercelConfig: null,
      pkg: null,
      tag: '',
      enableFlag: true,
    });
    expect(result).toEqual({
      fsApiBuilder: null,
      reason: 'Detected `ZOLA_VERSION` environment variable. Please remove it.',
      metadata: { hasDotOutput: false, hasMiddleware: false, plugins: [] },
    });
    delete process.env.ZOLA_VERSION;
  });

  it('should error when GUTENBERG_VERSION env var used', async () => {
    process.env.GUTENBERG_VERSION = 'v0.0.1';
    const files = { 'foo.html': '<h1>Foo</h1>' };
    const result = await detectFileSystemAPI({
      files,
      projectSettings: {},
      builders: [],
      vercelConfig: null,
      pkg: null,
      tag: '',
      enableFlag: true,
    });
    expect(result).toEqual({
      fsApiBuilder: null,
      reason:
        'Detected `GUTENBERG_VERSION` environment variable. Please remove it.',
      metadata: { hasDotOutput: false, hasMiddleware: false, plugins: [] },
    });
    delete process.env.GUTENBERG_VERSION;
  });

  it('should error when Go detected without corresponding plugin', async () => {
    const result = await detectFileSystemAPI({
      files: { 'api/foo.go': 'print("foo")' },
      projectSettings: {},
      builders: [{ use: '@vercel/go', src: 'api/**/*.go' }],
      vercelConfig: null,
      pkg: null,
      tag: '',
      enableFlag: true,
    });
    expect(result).toEqual({
      fsApiBuilder: null,
      reason:
        'Detected `go` Serverless Function usage without plugin `vercel-plugin-go`. Please run `npm i vercel-plugin-go`.',
      metadata: { hasDotOutput: false, hasMiddleware: false, plugins: [] },
    });
  });

  it('should error when Python detected without corresponding plugin', async () => {
    const result = await detectFileSystemAPI({
      files: { 'api/foo.py': 'print("foo")' },
      projectSettings: {},
      builders: [{ use: '@vercel/python', src: 'api/**/*.py' }],
      vercelConfig: null,
      pkg: null,
      tag: '',
      enableFlag: true,
    });
    expect(result).toEqual({
      fsApiBuilder: null,
      reason:
        'Detected `python` Serverless Function usage without plugin `vercel-plugin-python`. Please run `npm i vercel-plugin-python`.',
      metadata: { hasDotOutput: false, hasMiddleware: false, plugins: [] },
    });
  });

  it('should error when Ruby detected without corresponding plugin', async () => {
    const result = await detectFileSystemAPI({
      files: { 'api/foo.rb': 'print("foo")' },
      projectSettings: {},
      builders: [{ use: '@vercel/ruby', src: 'api/**/*.rb' }],
      vercelConfig: null,
      pkg: null,
      tag: '',
      enableFlag: true,
    });
    expect(result).toEqual({
      fsApiBuilder: null,
      reason:
        'Detected `ruby` Serverless Function usage without plugin `vercel-plugin-ruby`. Please run `npm i vercel-plugin-ruby`.',
      metadata: { hasDotOutput: false, hasMiddleware: false, plugins: [] },
    });
  });

  it('should succeed when Go detected with corresponding plugin', async () => {
    const result = await detectFileSystemAPI({
      files: { 'api/foo.go': 'print("foo")' },
      projectSettings: {},
      builders: [{ use: '@vercel/go', src: 'api/**/*.go' }],
      vercelConfig: null,
      pkg: { dependencies: { 'vercel-plugin-go': '^1.0.0' } },
      tag: '',
      enableFlag: true,
    });
    expect(result).toEqual({
      fsApiBuilder: {
        use: '@vercelruntimes/file-system-api',
        src: '**',
        config: {
          fileSystemAPI: true,
          framework: null,
          hasDotOutput: false,
          hasMiddleware: false,
          projectSettings: {},
        },
      },
      reason: null,
      metadata: {
        hasDotOutput: false,
        hasMiddleware: false,
        plugins: ['vercel-plugin-go'],
      },
    });
  });

  it('should succeed when Python detected with corresponding plugin', async () => {
    const result = await detectFileSystemAPI({
      files: { 'api/foo.py': 'print("foo")' },
      projectSettings: {},
      builders: [{ use: '@vercel/python', src: 'api/**/*.py' }],
      vercelConfig: null,
      pkg: { dependencies: { 'vercel-plugin-python': '^1.0.0' } },
      tag: '',
      enableFlag: true,
    });
    expect(result).toEqual({
      fsApiBuilder: {
        use: '@vercelruntimes/file-system-api',
        src: '**',
        config: {
          fileSystemAPI: true,
          framework: null,
          hasDotOutput: false,
          hasMiddleware: false,
          projectSettings: {},
        },
      },
      reason: null,
      metadata: {
        hasDotOutput: false,
        hasMiddleware: false,
        plugins: ['vercel-plugin-python'],
      },
    });
  });

  it('should succeed when Ruby detected with corresponding plugin', async () => {
    const result = await detectFileSystemAPI({
      files: { 'api/foo.rb': 'print("foo")' },
      projectSettings: {},
      builders: [{ use: '@vercel/ruby', src: 'api/**/*.rb' }],
      vercelConfig: null,
      pkg: { dependencies: { 'vercel-plugin-ruby': '^1.0.0' } },
      tag: '',
      enableFlag: true,
    });
    expect(result).toEqual({
      fsApiBuilder: {
        use: '@vercelruntimes/file-system-api',
        src: '**',
        config: {
          fileSystemAPI: true,
          framework: null,
          hasDotOutput: false,
          hasMiddleware: false,
          projectSettings: {},
        },
      },
      reason: null,
      metadata: {
        hasDotOutput: false,
        hasMiddleware: false,
        plugins: ['vercel-plugin-ruby'],
      },
    });
  });

  it('should error when framework is nuxtjs', async () => {
    const result = await detectFileSystemAPI({
      files: { 'api/foo.js': 'console.log("foo")' },
      projectSettings: { framework: 'nuxtjs' },
      builders: [{ use: '@vercel/node', src: 'api/**/*.js' }],
      vercelConfig: null,
      pkg: null,
      tag: '',
      enableFlag: true,
    });
    expect(result).toEqual({
      fsApiBuilder: null,
      reason:
        'Detected framework `nuxtjs` that only supports legacy File System API. Please contact the framework author.',
      metadata: { hasDotOutput: false, hasMiddleware: false, plugins: [] },
    });
  });

  it('should error when framework is sveltekit', async () => {
    const result = await detectFileSystemAPI({
      files: { 'api/foo.js': 'console.log("foo")' },
      projectSettings: { framework: 'sveltekit' },
      builders: [{ use: '@vercel/node', src: 'api/**/*.js' }],
      vercelConfig: null,
      pkg: null,
      tag: '',
      enableFlag: true,
    });
    expect(result).toEqual({
      fsApiBuilder: null,
      reason:
        'Detected framework `sveltekit` that only supports legacy File System API. Please contact the framework author.',
      metadata: { hasDotOutput: false, hasMiddleware: false, plugins: [] },
    });
  });

  it('should error when framework is redwoodjs', async () => {
    const result = await detectFileSystemAPI({
      files: { 'api/foo.js': 'console.log("foo")' },
      projectSettings: { framework: 'redwoodjs' },
      builders: [{ use: '@vercel/node', src: 'api/**/*.js' }],
      vercelConfig: null,
      pkg: null,
      tag: '',
      enableFlag: true,
    });
    expect(result).toEqual({
      fsApiBuilder: null,
      reason:
        'Detected framework `redwoodjs` that only supports legacy File System API. Please contact the framework author.',
      metadata: { hasDotOutput: false, hasMiddleware: false, plugins: [] },
    });
  });

  it('should error when framework is nextjs and has output dir', async () => {
    const result = await detectFileSystemAPI({
      files: { 'pages/foo.js': 'console.log("foo")' },
      projectSettings: { framework: 'nextjs', outputDirectory: 'dist' },
      builders: [{ use: '@vercel/next', src: 'package.json' }],
      vercelConfig: null,
      pkg: { dependencies: { next: '^12.0.0' } },
      tag: '',
      enableFlag: true,
    });
    expect(result).toEqual({
      fsApiBuilder: null,
      reason:
        'Detected Next.js with Output Directory `dist` override. Please change it back to the default.',
      metadata: { hasDotOutput: false, hasMiddleware: false, plugins: [] },
    });
  });

  it('should error when framework is nextjs but missing from dependencies', async () => {
    const result = await detectFileSystemAPI({
      files: { 'pages/foo.js': 'console.log("foo")' },
      projectSettings: { framework: 'nextjs' },
      builders: [{ use: '@vercel/next', src: 'package.json' }],
      vercelConfig: null,
      pkg: { dependencies: { 'not-next': '^12.0.0' } },
      tag: '',
      enableFlag: true,
    });
    expect(result).toEqual({
      fsApiBuilder: null,
      reason:
        'Detected Next.js in Project Settings but missing `next` package.json dependencies. Please run `npm i next`.',
      metadata: { hasDotOutput: false, hasMiddleware: false, plugins: [] },
    });
  });

  it('should error when framework is nextjs but dependency is older version', async () => {
    const result = await detectFileSystemAPI({
      files: { 'pages/foo.js': 'console.log("foo")' },
      projectSettings: { framework: 'nextjs' },
      builders: [{ use: '@vercel/next', src: 'package.json' }],
      vercelConfig: null,
      pkg: { dependencies: { next: '^9.0.0' } },
      tag: '',
      enableFlag: true,
    });
    expect(result).toEqual({
      fsApiBuilder: null,
      reason:
        'Detected legacy Next.js version "^9.0.0" in package.json. Please run `npm i next@latest` to upgrade.',
      metadata: { hasDotOutput: false, hasMiddleware: false, plugins: [] },
    });
  });

  it('should error when vercel cli is older version', async () => {
    const result = await detectFileSystemAPI({
      files: { 'pages/foo.js': 'console.log("foo")' },
      projectSettings: { framework: 'nextjs' },
      builders: [{ use: '@vercel/next', src: 'package.json' }],
      vercelConfig: null,
      pkg: { dependencies: { next: '^12.1.0', vercel: '^23.1.1' } },
      tag: '',
      enableFlag: true,
    });
    expect(result).toEqual({
      fsApiBuilder: null,
      reason:
        'Detected legacy Vercel CLI version "^23.1.1" in package.json. Please run `npm i vercel@latest` to upgrade.',
      metadata: { hasDotOutput: false, hasMiddleware: false, plugins: [] },
    });
  });

  it('should succeed when middleware detected', async () => {
    const result = await detectFileSystemAPI({
      files: { '_middleware.js': 'print("foo")' },
      projectSettings: {},
      builders: [{ use: '@vercel/static-build', src: 'package.json' }],
      vercelConfig: null,
      pkg: null,
      tag: '',
      enableFlag: false,
    });
    expect(result).toEqual({
      fsApiBuilder: {
        use: '@vercelruntimes/file-system-api',
        src: '**',
        config: {
          fileSystemAPI: true,
          framework: null,
          hasDotOutput: false,
          hasMiddleware: true,
          projectSettings: {},
        },
      },
      reason: null,
      metadata: { hasDotOutput: false, hasMiddleware: true, plugins: [] },
    });
  });

  it('should succeed when .output detected', async () => {
    const result = await detectFileSystemAPI({
      files: { '.output/routes-manifest.json': '{}' },
      projectSettings: { framework: 'remix' },
      builders: [{ use: '@vercel/static-build', src: 'package.json' }],
      vercelConfig: null,
      pkg: null,
      tag: '',
      enableFlag: false,
    });
    expect(result).toEqual({
      fsApiBuilder: {
        use: '@vercelruntimes/file-system-api',
        src: '**',
        config: {
          fileSystemAPI: true,
          framework: 'remix',
          hasDotOutput: true,
          hasMiddleware: false,
          projectSettings: { framework: 'remix' },
        },
      },
      reason: null,
      metadata: { hasDotOutput: true, hasMiddleware: false, plugins: [] },
    });
  });
});
