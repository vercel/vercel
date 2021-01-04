import { Source, Route, Handler } from '@vercel/routing-utils';
import {
  detectBuilders,
  detectOutputDirectory,
  detectApiDirectory,
  detectApiExtensions,
} from '../src';

describe('Test `detectBuilders`', () => {
  it('should never select now.json src', async () => {
    const files = ['docs/index.md', 'mkdocs.yml', 'now.json'];
    const { builders, errors } = await detectBuilders(files, null, {
      projectSettings: {
        buildCommand: 'mkdocs build',
        outputDirectory: 'site',
      },
    });
    expect(errors).toBe(null);
    expect(builders).toBeDefined();
    expect(builders![0].src).not.toBe('now.json');
  });

  it('package.json + no build', async () => {
    const pkg = { dependencies: { next: '9.0.0' } };
    const files = ['package.json', 'pages/index.js', 'public/index.html'];
    const { builders, errors } = await detectBuilders(files, pkg);
    expect(builders).toBe(null);
    expect(errors!.length).toBe(1);
  });

  it('package.json + no build + next', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      dependencies: { next: '9.0.0' },
    };
    const files = ['package.json', 'pages/index.js'];
    const { builders, errors } = await detectBuilders(files, pkg);
    expect(builders![0].use).toBe('@vercel/next');
    expect(errors).toBe(null);
  });

  it('package.json + no build + next', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      devDependencies: { next: '9.0.0' },
    };
    const files = ['package.json', 'pages/index.js'];
    const { builders, errors } = await detectBuilders(files, pkg);
    expect(builders![0].use).toBe('@vercel/next');
    expect(errors).toBe(null);
  });

  it('package.json + no build', async () => {
    const pkg = {};
    const files = ['package.json'];
    const { builders, errors } = await detectBuilders(files, pkg);
    expect(builders).toBe(null);
    expect(errors!.length).toBe(1);
  });

  it('static file', async () => {
    const files = ['index.html'];
    const { builders, errors } = await detectBuilders(files);
    expect(builders).toBe(null);
    expect(errors).toBe(null);
  });

  it('no package.json + public', async () => {
    const files = ['api/users.js', 'public/index.html'];
    const { builders, errors } = await detectBuilders(files);
    expect(builders![1].use).toBe('@vercel/static');
    expect(errors).toBe(null);
  });

  it('no package.json + no build + raw static + api', async () => {
    const files = ['api/users.js', 'index.html'];
    const { builders, errors } = await detectBuilders(files);
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].src).toBe('api/users.js');
    expect(builders![1].use).toBe('@vercel/static');
    expect(builders![1].src).toBe('!{api/**,package.json}');
    expect(builders!.length).toBe(2);
    expect(errors).toBe(null);
  });

  it('package.json + no build + root + api', async () => {
    const files = ['index.html', 'api/[endpoint].js', 'static/image.png'];
    const { builders, errors } = await detectBuilders(files);
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].src).toBe('api/[endpoint].js');
    expect(builders![1].use).toBe('@vercel/static');
    expect(builders![1].src).toBe('!{api/**,package.json}');
    expect(builders!.length).toBe(2);
    expect(errors).toBe(null);
  });

  it('api + ignore files', async () => {
    const files = [
      'api/_utils/handler.js',
      'api/[endpoint]/.helper.js',
      'api/[endpoint]/[id].js',
    ];

    const { builders } = await detectBuilders(files);
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].src).toBe('api/[endpoint]/[id].js');
    expect(builders!.length).toBe(1);
  });

  it('api + next + public', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      devDependencies: { next: '9.0.0' },
    };
    const files = ['package.json', 'api/endpoint.js', 'public/index.html'];

    const { builders } = await detectBuilders(files, pkg);
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].src).toBe('api/endpoint.js');
    expect(builders![1].use).toBe('@vercel/next');
    expect(builders![1].src).toBe('package.json');
    expect(builders!.length).toBe(2);
  });

  it('api + next + raw static', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      devDependencies: { next: '9.0.0' },
    };
    const files = ['package.json', 'api/endpoint.js', 'index.html'];

    const { builders } = await detectBuilders(files, pkg);
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].src).toBe('api/endpoint.js');
    expect(builders![1].use).toBe('@vercel/next');
    expect(builders![1].src).toBe('package.json');
    expect(builders!.length).toBe(2);
  });

  it('api + raw static', async () => {
    const files = ['api/endpoint.js', 'index.html', 'favicon.ico'];

    const { builders } = await detectBuilders(files);
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].src).toBe('api/endpoint.js');
    expect(builders![1].use).toBe('@vercel/static');
    expect(builders![1].src).toBe('!{api/**,package.json}');
    expect(builders!.length).toBe(2);
  });

  it('api + public', async () => {
    const files = [
      'api/endpoint.js',
      'public/index.html',
      'public/favicon.ico',
      'README.md',
    ];

    const { builders } = await detectBuilders(files);
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].src).toBe('api/endpoint.js');
    expect(builders![1].use).toBe('@vercel/static');
    expect(builders![1].src).toBe('public/**/*');
    expect(builders!.length).toBe(2);
  });

  it('api go with test files', async () => {
    const files = [
      'api/index.go',
      'api/index_test.go',
      'api/test.go',
      'api/testing_another.go',
      'api/readme.md',
      'api/config/staging.go',
      'api/config/staging_test.go',
      'api/config/production.go',
      'api/config/production_test.go',
      'api/src/controllers/health.go',
      'api/src/controllers/user.module.go',
      'api/src/controllers/user.module_test.go',
    ];

    const { builders } = await detectBuilders(files);
    expect(builders!.length).toBe(7);
    expect(builders!.some(b => b.src!.endsWith('_test.go'))).toBe(false);
  });

  it('just public', async () => {
    const files = ['public/index.html', 'public/favicon.ico', 'README.md'];

    const { builders } = await detectBuilders(files);
    expect(builders![0].src).toBe('public/**/*');
    expect(builders!.length).toBe(1);
  });

  it('next + public', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      devDependencies: { next: '9.0.0' },
    };
    const files = ['package.json', 'public/index.html', 'README.md'];

    const { builders } = await detectBuilders(files, pkg);
    expect(builders![0].use).toBe('@vercel/next');
    expect(builders![0].src).toBe('package.json');
    expect(builders!.length).toBe(1);
  });

  it('nuxt', async () => {
    const pkg = {
      scripts: { build: 'nuxt build' },
      dependencies: { nuxt: '2.8.1' },
    };
    const files = ['package.json', 'pages/index.js'];

    const { builders } = await detectBuilders(files, pkg);
    expect(builders![0].use).toBe('@vercel/static-build');
    expect(builders![0].src).toBe('package.json');
    expect(builders!.length).toBe(1);
  });

  it('nuxt + tag canary', async () => {
    const pkg = {
      scripts: { build: 'nuxt build' },
      dependencies: { nuxt: '2.8.1' },
    };
    const files = ['package.json', 'pages/index.js'];

    const { builders } = await detectBuilders(files, pkg, { tag: 'canary' });
    expect(builders![0].use).toBe('@vercel/static-build@canary');
    expect(builders![0].src).toBe('package.json');
    expect(builders!.length).toBe(1);
  });

  it('package.json with no build + api', async () => {
    const pkg = { dependencies: { next: '9.0.0' } };
    const files = ['package.json', 'api/[endpoint].js'];

    const { builders } = await detectBuilders(files, pkg);
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].src).toBe('api/[endpoint].js');
    expect(builders!.length).toBe(1);
  });

  it('package.json with no build + public directory', async () => {
    const pkg = { dependencies: { next: '9.0.0' } };
    const files = ['package.json', 'public/index.html'];

    const { builders, errors } = await detectBuilders(files, pkg);
    expect(builders).toBe(null);
    expect(errors!.length).toBe(1);
  });

  it('no package.json + api', async () => {
    const files = ['api/[endpoint].js', 'api/[endpoint]/[id].js'];

    const { builders } = await detectBuilders(files);
    expect(builders!.length).toBe(2);
  });

  it('no package.json + no api', async () => {
    const files = ['index.html'];

    const { builders, errors } = await detectBuilders(files);
    expect(builders).toBe(null);
    expect(errors).toBe(null);
  });

  it('package.json + api + canary', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      dependencies: { next: '9.0.0' },
    };
    const files = [
      'pages/index.js',
      'api/[endpoint].js',
      'api/[endpoint]/[id].js',
    ];

    const { builders } = await detectBuilders(files, pkg, { tag: 'canary' });
    expect(builders![0].use).toBe('@vercel/node@canary');
    expect(builders![1].use).toBe('@vercel/node@canary');
    expect(builders![2].use).toBe('@vercel/next@canary');
    expect(builders!.length).toBe(3);
  });

  it('package.json + api + latest', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      dependencies: { next: '9.0.0' },
    };
    const files = [
      'pages/index.js',
      'api/[endpoint].js',
      'api/[endpoint]/[id].js',
    ];

    const { builders } = await detectBuilders(files, pkg, { tag: 'latest' });
    expect(builders![0].use).toBe('@vercel/node@latest');
    expect(builders![1].use).toBe('@vercel/node@latest');
    expect(builders![2].use).toBe('@vercel/next@latest');
    expect(builders!.length).toBe(3);
  });

  it('package.json + api + random tag', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      dependencies: { next: '9.0.0' },
    };
    const files = [
      'pages/index.js',
      'api/[endpoint].js',
      'api/[endpoint]/[id].js',
    ];

    const { builders } = await detectBuilders(files, pkg, { tag: 'haha' });
    expect(builders![0].use).toBe('@vercel/node@haha');
    expect(builders![1].use).toBe('@vercel/node@haha');
    expect(builders![2].use).toBe('@vercel/next@haha');
    expect(builders!.length).toBe(3);
  });

  it('next.js pages/api + api', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      dependencies: { next: '9.0.0' },
    };
    const files = ['api/user.js', 'pages/api/user.js'];

    const { warnings, errors, builders } = await detectBuilders(files, pkg);

    expect(errors).toBe(null);
    expect(warnings[0]).toBeDefined();
    expect(warnings[0].code).toBe('conflicting_files');
    expect(builders).toBeDefined();
    expect(builders!.length).toBe(2);
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![1].use).toBe('@vercel/next');
  });

  it('many static files + one api file', async () => {
    const files = Array.from({ length: 5000 }).map((_, i) => `file${i}.html`);
    files.push('api/index.ts');
    const { builders } = await detectBuilders(files);

    expect(builders!.length).toBe(2);
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].src).toBe('api/index.ts');
    expect(builders![1].use).toBe('@vercel/static');
    expect(builders![1].src).toBe('!{api/**,package.json}');
  });

  it('functions with nextjs', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      dependencies: { next: '9.0.0' },
    };
    const functions = {
      'pages/api/teams/**': {
        memory: 128,
        maxDuration: 10,
      },
    };
    const files = [
      'package.json',
      'pages/index.js',
      'pages/api/teams/members.ts',
    ];
    const { builders, errors } = await detectBuilders(files, pkg, {
      functions,
    });

    expect(errors).toBe(null);
    expect(builders!.length).toBe(1);
    expect(builders![0]).toEqual({
      src: 'package.json',
      use: '@vercel/next',
      config: {
        zeroConfig: true,
        functions: {
          'pages/api/teams/**': {
            memory: 128,
            maxDuration: 10,
          },
        },
      },
    });
  });

  it('extend with functions', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      dependencies: { next: '9.0.0' },
    };
    const functions = {
      'api/users/*.ts': {
        runtime: 'my-custom-runtime-package@1.0.0',
      },
      'api/teams/members.ts': {
        memory: 128,
        maxDuration: 10,
      },
    };
    const files = [
      'package.json',
      'pages/index.js',
      'api/users/[id].ts',
      'api/teams/members.ts',
    ];
    const { builders } = await detectBuilders(files, pkg, { functions });

    expect(builders!.length).toBe(3);
    expect(builders![0]).toEqual({
      src: 'api/teams/members.ts',
      use: '@vercel/node',
      config: {
        zeroConfig: true,
        functions: {
          'api/teams/members.ts': {
            memory: 128,
            maxDuration: 10,
          },
        },
      },
    });
    expect(builders![1]).toEqual({
      src: 'api/users/[id].ts',
      use: 'my-custom-runtime-package@1.0.0',
      config: {
        zeroConfig: true,
        functions: {
          'api/users/*.ts': {
            runtime: 'my-custom-runtime-package@1.0.0',
          },
        },
      },
    });
    expect(builders![2]).toEqual({
      src: 'package.json',
      use: '@vercel/next',
      config: {
        zeroConfig: true,
      },
    });
  });

  it('invalid function key', async () => {
    const functions = { ['a'.repeat(1000)]: { memory: 128 } };
    const files = ['pages/index.ts'];
    const { builders, errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(builders).toBe(null);
    expect(errors!.length).toBe(1);
    expect(errors![0].code).toBe('invalid_function_glob');
  });

  it('invalid function maxDuration', async () => {
    const functions = { 'pages/index.ts': { maxDuration: -1 } };
    const files = ['pages/index.ts'];
    const { builders, errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(builders).toBe(null);
    expect(errors!.length).toBe(1);
    expect(errors![0].code).toBe('invalid_function_duration');
  });

  it('invalid function memory', async () => {
    const functions = { 'pages/index.ts': { memory: 200 } };
    const files = ['pages/index.ts'];
    const { builders, errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(builders).toBe(null);
    expect(errors!.length).toBe(1);
    expect(errors![0].code).toBe('invalid_function_memory');
  });

  it('missing runtime version', async () => {
    const functions = { 'pages/index.ts': { runtime: 'haha' } };
    const files = ['pages/index.ts'];
    const { builders, errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(builders).toBe(null);
    expect(errors!.length).toBe(1);
    expect(errors![0].code).toBe('invalid_function_runtime');
  });

  it('use a custom runtime', async () => {
    const functions = { 'api/user.php': { runtime: 'vercel-php@0.1.0' } };
    const files = ['api/user.php'];
    const { builders, errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(errors).toBe(null);
    expect(builders!.length).toBe(1);
    expect(builders![0].use).toBe('vercel-php@0.1.0');
  });

  it('use a custom runtime but without a source', async () => {
    const functions = { 'api/user.php': { runtime: 'vercel-php@0.1.0' } };
    const files = ['api/team.js'];
    const { errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(errors!.length).toBe(1);
    expect(errors![0].code).toBe('unused_function');
  });

  it('do not allow empty functions', async () => {
    const functions = { 'api/user.php': {} };
    const files = ['api/user.php'];
    const { errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(errors!.length).toBe(1);
    expect(errors![0].code).toBe('invalid_function');
  });

  it('do not allow null functions', async () => {
    const functions = { 'api/user.php': null };
    const files = ['api/user.php'];
    // @ts-ignore
    const { errors } = await detectBuilders(files, null, {
      // @ts-ignore
      functions,
    });

    expect(errors!.length).toBe(1);
    expect(errors![0].code).toBe('invalid_function');
  });

  it('Do not allow functions that are not used by @vercel/next', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      dependencies: { next: '9.0.0' },
    };
    const functions = { 'test.js': { memory: 1024 } };
    const files = ['pages/index.js', 'test.js'];

    const { errors } = await detectBuilders(files, pkg, { functions });

    expect(errors).toBeDefined();
    expect(errors![0].code).toBe('unused_function');
  });

  it('Must include includeFiles config property', async () => {
    const functions = {
      'api/test.js': { includeFiles: 'text/include.txt' },
    };
    const files = ['api/test.js'];

    const { builders, errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(errors).toBe(null);
    expect(builders).not.toBe(null);
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].config).toMatchObject({
      functions,
      zeroConfig: true,
      includeFiles: 'text/include.txt',
    });
  });

  it('Must include excludeFiles config property', async () => {
    const functions = {
      'api/test.js': { excludeFiles: 'text/exclude.txt' },
    };
    const files = ['api/test.js'];

    const { builders, errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(errors).toBe(null);
    expect(builders).not.toBe(null);
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].config).toMatchObject({
      functions,
      zeroConfig: true,
      excludeFiles: 'text/exclude.txt',
    });
  });

  it('Must include excludeFiles and includeFiles config property', async () => {
    const functions = {
      'api/test.js': {
        excludeFiles: 'text/exclude.txt',
        includeFiles: 'text/include.txt',
      },
    };
    const files = ['api/test.js'];

    const { builders, errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(errors).toBe(null);
    expect(builders).not.toBe(null);
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].config).toMatchObject({
      functions,
      zeroConfig: true,
      excludeFiles: 'text/exclude.txt',
      includeFiles: 'text/include.txt',
    });
  });

  it('Must fail for includeFiles config property', async () => {
    const functions = {
      'api/test.js': { includeFiles: { test: 1 } },
    };
    const files = ['api/test.js'];

    // @ts-ignore
    const { errors } = await detectBuilders(files, null, { functions });

    expect(errors).not.toBe(null);
    expect(errors![0].code).toBe('invalid_function_property');
  });

  it('Must fail for excludeFiles config property', async () => {
    const functions = {
      'api/test.js': { excludeFiles: { test: 1 } },
    };
    const files = ['api/test.js'];

    // @ts-ignore: Since we test an invalid type
    const { errors } = await detectBuilders(files, null, { functions });

    expect(errors).not.toBe(null);
    expect(errors![0].code).toBe('invalid_function_property');
  });

  it('Must fail when function patterns start with a slash', async () => {
    const functions = {
      '/api/test.js': { memory: 128 },
    };
    const files = ['api/test.js', '/api/test.js'];

    const { errors } = await detectBuilders(files, null, { functions });

    expect(errors).not.toBe(null);
    expect(errors![0].code).toBe('invalid_function_source');
  });

  it('Custom static output directory', async () => {
    const projectSettings = {
      outputDirectory: 'dist',
    };

    const files = ['dist/index.html', 'dist/style.css'];

    const { builders, defaultRoutes } = await detectBuilders(files, null, {
      projectSettings,
    });

    expect(builders!.length).toBe(1);
    expect(builders![0].src).toBe('dist/**/*');
    expect(builders![0].use).toBe('@vercel/static');

    expect(defaultRoutes!.length).toBe(1);
    expect((defaultRoutes![0] as any).src).toBe('/(.*)');
    expect((defaultRoutes![0] as any).dest).toBe('/dist/$1');
  });

  it('Custom static output directory with api', async () => {
    const projectSettings = {
      outputDirectory: 'output',
    };

    const files = ['api/user.ts', 'output/index.html', 'output/style.css'];

    const { builders, defaultRoutes } = await detectBuilders(files, null, {
      projectSettings,
    });

    expect(builders!.length).toBe(2);
    expect(builders![1].src).toBe('output/**/*');
    expect(builders![1].use).toBe('@vercel/static');

    expect(defaultRoutes!.length).toBe(3);
    expect((defaultRoutes![1] as any).status).toBe(404);
    expect((defaultRoutes![2] as any).src).toBe('/(.*)');
    expect((defaultRoutes![2] as any).dest).toBe('/output/$1');
  });

  it('Framework with non-package.json entrypoint', async () => {
    const files = ['config.yaml'];
    const projectSettings = {
      framework: 'hugo',
    };

    const { builders } = await detectBuilders(files, null, { projectSettings });

    expect(builders).toEqual([
      {
        use: '@vercel/static-build',
        src: 'config.yaml',
        config: {
          zeroConfig: true,
          framework: 'hugo',
        },
      },
    ]);
  });

  it('No framework, only package.json', async () => {
    const files = ['package.json'];
    const pkg = {
      scripts: {
        build: 'build.sh',
      },
    };

    const { builders } = await detectBuilders(files, pkg);

    expect(builders).toEqual([
      {
        use: '@vercel/static-build',
        src: 'package.json',
        config: {
          zeroConfig: true,
        },
      },
    ]);
  });

  it('Framework with an API', async () => {
    const files = ['config.rb', 'api/date.rb'];
    const projectSettings = { framework: 'middleman' };

    const { builders } = await detectBuilders(files, null, { projectSettings });

    expect(builders).toEqual([
      {
        use: '@vercel/ruby',
        src: 'api/date.rb',
        config: {
          zeroConfig: true,
        },
      },
      {
        use: '@vercel/static-build',
        src: 'config.rb',
        config: {
          zeroConfig: true,
          framework: 'middleman',
        },
      },
    ]);
  });

  it('Error for non-api functions', async () => {
    const files = ['server/hello.ts', 'public/index.html'];
    const functions = {
      'server/**/*.ts': {
        runtime: '@vercel/node@1.3.1',
      },
    };

    const { errors } = await detectBuilders(files, null, { functions });

    expect(errors).toEqual([
      {
        code: 'unused_function',
        message: `The pattern "server/**/*.ts" defined in \`functions\` doesn't match any Serverless Functions inside the \`api\` directory.`,
        action: 'Learn More',
        link: 'https://vercel.link/unmatched-function-pattern',
      },
    ]);
  });

  it('All static if `buildCommand` is an empty string', async () => {
    const files = ['index.html'];
    const projectSettings = { buildCommand: '' };
    const { builders, errors } = await detectBuilders(files, null, {
      projectSettings,
    });
    expect(errors).toBe(null);
    expect(builders).toBe(null);
  });

  it('All static if `outputDirectory` is an empty string', async () => {
    const files = ['index.html'];
    const projectSettings = { outputDirectory: '' };
    const { builders, errors } = await detectBuilders(files, null, {
      projectSettings,
    });
    expect(errors).toBe(null);
    expect(builders).toBe(null);
  });

  it('All static if `buildCommand` is an empty string with an `outputDirectory`', async () => {
    const files = ['out/index.html'];
    const projectSettings = { buildCommand: '', outputDirectory: 'out' };
    const { builders, errors } = await detectBuilders(files, null, {
      projectSettings,
    });
    expect(errors).toBe(null);
    expect(builders![0]!.use).toBe('@vercel/static');
    expect(builders![0]!.src).toBe('out/**/*');
  });

  it('do not require build script when `buildCommand` is an empty string', async () => {
    const files = ['index.html', 'about.html', 'package.json'];
    const projectSettings = { buildCommand: '', outputDirectory: '' };
    const pkg = {
      scripts: {
        build: 'false',
      },
    };

    const { builders, errors } = await detectBuilders(files, pkg, {
      projectSettings,
    });
    expect(builders).toBe(null);
    expect(errors).toBe(null);
  });
});

describe('Test `detectBuilders` with `featHandleMiss=true`', () => {
  const featHandleMiss = true;

  it('should select "installCommand"', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      dependencies: { next: '9.0.0' },
    };
    const files = ['package.json', 'pages/index.js', 'public/index.html'];
    const { builders, errors } = await detectBuilders(files, pkg, {
      featHandleMiss,
      projectSettings: {
        installCommand: 'npx pnpm install',
      },
    });
    expect(errors).toBe(null);
    expect(builders).toBeDefined();
    expect(builders!.length).toStrictEqual(1);
    expect(builders![0].src).toStrictEqual('package.json');
    expect(builders![0].use).toStrictEqual('@vercel/next');
    expect(builders![0].config!.zeroConfig).toStrictEqual(true);
    expect(builders![0].config!.installCommand).toStrictEqual(
      'npx pnpm install'
    );
  });

  it('should select empty "installCommand"', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      dependencies: { next: '9.0.0' },
    };
    const files = ['package.json', 'pages/index.js', 'public/index.html'];
    const { builders, errors } = await detectBuilders(files, pkg, {
      featHandleMiss,
      projectSettings: {
        installCommand: '',
      },
    });
    expect(errors).toBe(null);
    expect(builders).toBeDefined();
    expect(builders!.length).toStrictEqual(1);
    expect(builders![0].src).toStrictEqual('package.json');
    expect(builders![0].use).toStrictEqual('@vercel/next');
    expect(builders![0].config!.zeroConfig).toStrictEqual(true);
    expect(builders![0].config!.installCommand).toStrictEqual('');
  });

  it('should never select now.json src', async () => {
    const files = ['docs/index.md', 'mkdocs.yml', 'now.json'];
    const { builders, errors } = await detectBuilders(files, null, {
      featHandleMiss,
      projectSettings: {
        buildCommand: 'mkdocs build',
        outputDirectory: 'site',
      },
    });
    expect(errors).toBe(null);
    expect(builders).toBeDefined();
    expect(builders![0].src).not.toBe('now.json');
  });

  it('package.json + no build', async () => {
    const pkg = { dependencies: { next: '9.0.0' } };
    const files = ['package.json', 'pages/index.js', 'public/index.html'];
    const { builders, errors } = await detectBuilders(files, pkg, {
      featHandleMiss,
    });
    expect(builders).toBe(null);
    expect(errors!.length).toBe(1);
  });

  it('package.json + no build + next', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      dependencies: { next: '9.0.0' },
    };
    const files = ['package.json', 'pages/index.js'];
    const {
      builders,
      errors,
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
      errorRoutes,
    } = await detectBuilders(files, pkg, { featHandleMiss });
    expect(builders![0].use).toBe('@vercel/next');
    expect(errors).toBe(null);
    expect(defaultRoutes).toStrictEqual([]);
    expect(redirectRoutes).toStrictEqual([]);
    expect(rewriteRoutes).toStrictEqual([]);
    expect(errorRoutes).toStrictEqual([]);
  });

  it('package.json + no build + next', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      devDependencies: { next: '9.0.0' },
    };
    const files = ['package.json', 'pages/index.js'];
    const {
      builders,
      errors,
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
      errorRoutes,
    } = await detectBuilders(files, pkg, { featHandleMiss });
    expect(builders![0].use).toBe('@vercel/next');
    expect(errors).toBe(null);
    expect(defaultRoutes).toStrictEqual([]);
    expect(redirectRoutes).toStrictEqual([]);
    expect(rewriteRoutes).toStrictEqual([]);
    expect(errorRoutes).toStrictEqual([]);
  });

  it('package.json + no build', async () => {
    const pkg = {};
    const files = ['package.json'];
    const { builders, errors } = await detectBuilders(files, pkg, {
      featHandleMiss,
    });
    expect(builders).toBe(null);
    expect(errors!.length).toBe(1);
  });

  it('static file', async () => {
    const files = ['index.html'];
    const {
      builders,
      errors,
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
      errorRoutes,
    } = await detectBuilders(files, null, { featHandleMiss });
    expect(builders).toBe(null);
    expect(errors).toBe(null);
    expect(defaultRoutes).toStrictEqual([]);
    expect(redirectRoutes).toStrictEqual([]);
    expect(rewriteRoutes).toStrictEqual([]);
    expect(errorRoutes!.length).toBe(1);
    expect((errorRoutes![0] as Source).status).toBe(404);
  });

  it('no package.json + public', async () => {
    const files = ['api/users.js', 'public/index.html'];
    const {
      builders,
      errors,
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
      errorRoutes,
    } = await detectBuilders(files, null, { featHandleMiss });
    expect(builders![1].use).toBe('@vercel/static');
    expect(errors).toBe(null);

    expect(defaultRoutes!.length).toBe(2);
    expect((defaultRoutes![0] as Handler).handle).toBe('miss');
    expect((defaultRoutes![1] as Source).dest).toBe('/api/$1');
    expect(redirectRoutes).toStrictEqual([]);
    expect(rewriteRoutes!.length).toBe(1);
    expect((rewriteRoutes![0] as Source).status).toBe(404);
    expect(errorRoutes!.length).toBe(1);
    expect((errorRoutes![0] as Source).status).toBe(404);
  });

  it('no package.json + no build + raw static + api', async () => {
    const files = ['api/users.js', 'index.html'];
    const {
      builders,
      errors,
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
      errorRoutes,
    } = await detectBuilders(files, null, { featHandleMiss });
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].src).toBe('api/users.js');
    expect(builders![1].use).toBe('@vercel/static');
    expect(builders![1].src).toBe('!{api/**,package.json}');
    expect(builders!.length).toBe(2);
    expect(errors).toBe(null);

    expect(defaultRoutes!.length).toBe(2);
    expect((defaultRoutes![0] as Handler).handle).toBe('miss');
    expect((defaultRoutes![1] as Source).dest).toBe('/api/$1');
    expect(redirectRoutes).toStrictEqual([]);
    expect(rewriteRoutes!.length).toBe(1);
    expect((rewriteRoutes![0] as Source).status).toBe(404);
    expect(errorRoutes!.length).toBe(1);
    expect((errorRoutes![0] as Source).status).toBe(404);
  });

  it('package.json + no build + root + api', async () => {
    const files = ['index.html', 'api/[endpoint].js', 'static/image.png'];
    const { builders, errors } = await detectBuilders(files, null, {
      featHandleMiss,
    });
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].src).toBe('api/[endpoint].js');
    expect(builders![1].use).toBe('@vercel/static');
    expect(builders![1].src).toBe('!{api/**,package.json}');
    expect(builders!.length).toBe(2);
    expect(errors).toBe(null);
  });

  it('api + ignore files', async () => {
    const files = [
      'api/_utils/handler.js',
      'api/[endpoint]/.helper.js',
      'api/[endpoint]/[id].js',
    ];

    const {
      builders,
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
      errorRoutes,
    } = await detectBuilders(files, undefined, { featHandleMiss });
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].src).toBe('api/[endpoint]/[id].js');
    expect(builders!.length).toBe(1);

    expect(defaultRoutes!.length).toBe(2);
    expect((defaultRoutes![0] as Handler).handle).toBe('miss');
    expect((defaultRoutes![1] as Source).dest).toBe('/api/$1');
    expect(redirectRoutes).toStrictEqual([]);
    expect(rewriteRoutes!.length).toBe(2);
    expect((rewriteRoutes![0] as Source).src).toBe('^/api/([^/]+)/([^/]+)$');
    expect((rewriteRoutes![1] as Source).status).toBe(404);
    expect(errorRoutes!.length).toBe(1);
    expect((errorRoutes![0] as Source).status).toBe(404);
  });

  it('api + next + public', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      devDependencies: { next: '9.0.0' },
    };
    const files = ['package.json', 'api/endpoint.js', 'public/index.html'];

    const {
      builders,
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
      errorRoutes,
    } = await detectBuilders(files, pkg, { featHandleMiss });
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].src).toBe('api/endpoint.js');
    expect(builders![1].use).toBe('@vercel/next');
    expect(builders![1].src).toBe('package.json');
    expect(builders!.length).toBe(2);

    expect(defaultRoutes!.length).toBe(2);
    expect((defaultRoutes![0] as Handler).handle).toBe('miss');
    expect((defaultRoutes![1] as Source).dest).toBe('/api/$1');
    expect(redirectRoutes).toStrictEqual([]);
    expect(rewriteRoutes!.length).toBe(1);
    expect((rewriteRoutes![0] as Source).status).toBe(404);
    expect(errorRoutes).toStrictEqual([]);
  });

  it('api + next + raw static', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      devDependencies: { next: '9.0.0' },
    };
    const files = ['package.json', 'api/endpoint.js', 'index.html'];

    const {
      builders,
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
      errorRoutes,
    } = await detectBuilders(files, pkg, { featHandleMiss });
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].src).toBe('api/endpoint.js');
    expect(builders![1].use).toBe('@vercel/next');
    expect(builders![1].src).toBe('package.json');
    expect(builders!.length).toBe(2);

    expect(defaultRoutes!.length).toBe(2);
    expect((defaultRoutes![0] as Handler).handle).toBe('miss');
    expect((defaultRoutes![1] as Source).dest).toBe('/api/$1');
    expect(redirectRoutes).toStrictEqual([]);
    expect(rewriteRoutes!.length).toBe(1);
    expect((rewriteRoutes![0] as Source).status).toBe(404);
    expect(errorRoutes).toStrictEqual([]);
  });

  it('Using "Create React App" framework with `next` in dependencies should NOT autodetect Next.js for new projects', async () => {
    const pkg = {
      scripts: {
        dev: 'react-scripts start',
        build: 'react-scripts build',
      },
      dependencies: {
        next: '9.3.5',
        react: '16.13.1',
        'react-dom': '16.13.1',
        'react-scripts': '2.1.1',
      },
    };
    const files = ['package.json', 'src/index.js', 'public/favicon.ico'];
    const projectSettings = {
      framework: 'create-react-app',
      buildCommand: 'react-scripts build',
      createdAt: Date.parse('2020-07-01'),
    };

    const { builders, errorRoutes } = await detectBuilders(files, pkg, {
      projectSettings,
      featHandleMiss,
    });

    expect(builders).toEqual([
      {
        use: '@vercel/static-build',
        src: 'package.json',
        config: {
          zeroConfig: true,
          framework: projectSettings.framework,
          buildCommand: projectSettings.buildCommand,
        },
      },
    ]);
    expect(errorRoutes!.length).toBe(1);
    expect((errorRoutes![0] as Source).status).toBe(404);
  });

  it('Using "Other" framework with Storybook should NOT autodetect Next.js for new projects', async () => {
    const pkg = {
      scripts: {
        dev: 'next dev',
        build: 'next build',
        storybook: 'start-storybook -p 6006',
        'build-storybook': 'build-storybook',
      },
      dependencies: {
        next: '9.3.5',
        react: '16.13.1',
        'react-dom': '16.13.1',
      },
      devDependencies: {
        '@babel/core': '7.9.0',
        '@storybook/addon-links': '5.3.18',
        '@storybook/addons': '5.3.18',
        '@storybook/react': '5.3.18',
      },
    };
    const files = ['package.json', 'pages/api/foo.js', 'index.html'];
    const projectSettings = {
      framework: null, // Selected "Other" framework
      buildCommand: 'yarn build-storybook',
      createdAt: Date.parse('2020-07-01'),
    };

    const { builders, errorRoutes } = await detectBuilders(files, pkg, {
      projectSettings,
      featHandleMiss,
    });

    expect(builders).toEqual([
      {
        use: '@vercel/static-build',
        src: 'package.json',
        config: {
          zeroConfig: true,
          buildCommand: projectSettings.buildCommand,
        },
      },
    ]);
    expect(errorRoutes!.length).toBe(1);
    expect((errorRoutes![0] as Source).status).toBe(404);
  });

  it('Using "Other" framework should autodetect Next.js for old projects', async () => {
    const pkg = {
      scripts: {
        dev: 'next dev',
        build: 'next build',
      },
      dependencies: {
        next: '9.3.5',
        react: '16.13.1',
        'react-dom': '16.13.1',
      },
    };
    const files = ['package.json', 'pages/api/foo.js', 'index.html'];
    const projectSettings = {
      framework: null, // Selected "Other" framework
      createdAt: Date.parse('2020-02-01'),
    };

    const { builders, errorRoutes } = await detectBuilders(files, pkg, {
      projectSettings,
      featHandleMiss,
    });

    expect(builders).toEqual([
      {
        use: '@vercel/next',
        src: 'package.json',
        config: {
          zeroConfig: true,
        },
      },
    ]);
    expect(errorRoutes).toStrictEqual([]);
  });

  it('api + raw static', async () => {
    const files = ['api/endpoint.js', 'index.html', 'favicon.ico'];

    const {
      builders,
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
      errorRoutes,
    } = await detectBuilders(files, null, { featHandleMiss });
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].src).toBe('api/endpoint.js');
    expect(builders![1].use).toBe('@vercel/static');
    expect(builders![1].src).toBe('!{api/**,package.json}');
    expect(builders!.length).toBe(2);

    expect(defaultRoutes!.length).toBe(2);
    expect((defaultRoutes![0] as Handler).handle).toBe('miss');
    expect((defaultRoutes![1] as Source).dest).toBe('/api/$1');
    expect(redirectRoutes).toStrictEqual([]);
    expect(rewriteRoutes!.length).toBe(1);
    expect((rewriteRoutes![0] as Source).status).toBe(404);
    expect(errorRoutes!.length).toBe(1);
    expect((errorRoutes![0] as Source).status).toBe(404);
  });

  it('api + raw static + package.json no build script', async () => {
    const pkg = {
      private: true,
      engines: { node: '12.x' },
    };
    const files = ['api/version.js', 'index.html', 'package.json'];

    const {
      builders,
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
      errorRoutes,
    } = await detectBuilders(files, pkg, { featHandleMiss });
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].src).toBe('api/version.js');
    expect(builders![1].use).toBe('@vercel/static');
    expect(builders![1].src).toBe('!{api/**,package.json}');
    expect(builders!.length).toBe(2);

    expect(defaultRoutes!.length).toBe(2);
    expect((defaultRoutes![0] as Handler).handle).toBe('miss');
    expect((defaultRoutes![1] as Source).dest).toBe('/api/$1');
    expect(redirectRoutes).toStrictEqual([]);
    expect(rewriteRoutes!.length).toBe(1);
    expect((rewriteRoutes![0] as Source).status).toBe(404);
    expect(errorRoutes!.length).toBe(1);
    expect((errorRoutes![0] as Source).status).toBe(404);
  });

  it('api + public', async () => {
    const files = [
      'api/endpoint.js',
      'public/index.html',
      'public/favicon.ico',
      'README.md',
    ];

    const { builders, errorRoutes } = await detectBuilders(files, undefined, {
      featHandleMiss,
    });
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].src).toBe('api/endpoint.js');
    expect(builders![1].use).toBe('@vercel/static');
    expect(builders![1].src).toBe('public/**/*');
    expect(builders!.length).toBe(2);
    expect(errorRoutes!.length).toBe(1);
    expect((errorRoutes![0] as Source).status).toBe(404);
  });

  it('api go with test files', async () => {
    const files = [
      'api/index.go',
      'api/index_test.go',
      'api/test.go',
      'api/testing_another.go',
      'api/readme.md',
      'api/config/staging.go',
      'api/config/staging_test.go',
      'api/config/production.go',
      'api/config/production_test.go',
      'api/src/controllers/health.go',
      'api/src/controllers/user.module.go',
      'api/src/controllers/user.module_test.go',
    ];

    const { builders, errorRoutes } = await detectBuilders(files, undefined, {
      featHandleMiss,
    });
    expect(builders!.length).toBe(7);
    expect(builders!.some(b => b.src!.endsWith('_test.go'))).toBe(false);
    expect(errorRoutes!.length).toBe(1);
    expect((errorRoutes![0] as Source).status).toBe(404);
  });

  it('just public', async () => {
    const files = ['public/index.html', 'public/favicon.ico', 'README.md'];

    const { builders, errorRoutes } = await detectBuilders(files, undefined, {
      featHandleMiss,
    });
    expect(builders![0].src).toBe('public/**/*');
    expect(builders![0].use).toBe('@vercel/static');
    expect(builders!.length).toBe(1);
    expect(errorRoutes!.length).toBe(1);
    expect((errorRoutes![0] as Source).status).toBe(404);
  });

  it('next + public', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      devDependencies: { next: '9.0.0' },
    };
    const files = ['package.json', 'public/index.html', 'README.md'];

    const { builders, errorRoutes } = await detectBuilders(files, pkg, {
      featHandleMiss,
    });
    expect(builders![0].use).toBe('@vercel/next');
    expect(builders![0].src).toBe('package.json');
    expect(builders!.length).toBe(1);
    expect(errorRoutes!.length).toBe(0);
  });

  it('nuxt', async () => {
    const pkg = {
      scripts: { build: 'nuxt build' },
      dependencies: { nuxt: '2.8.1' },
    };
    const files = ['package.json', 'pages/index.js'];

    const { builders, errorRoutes } = await detectBuilders(files, pkg, {
      featHandleMiss,
    });
    expect(builders![0].use).toBe('@vercel/static-build');
    expect(builders![0].src).toBe('package.json');
    expect(builders!.length).toBe(1);
    expect(errorRoutes!.length).toBe(1);
    expect((errorRoutes![0] as Source).status).toBe(404);
  });

  it('nuxt + tag canary', async () => {
    const pkg = {
      scripts: { build: 'nuxt build' },
      dependencies: { nuxt: '2.8.1' },
    };
    const files = ['package.json', 'pages/index.js'];

    const { builders, errorRoutes } = await detectBuilders(files, pkg, {
      tag: 'canary',
      featHandleMiss,
    });
    expect(builders![0].use).toBe('@vercel/static-build@canary');
    expect(builders![0].src).toBe('package.json');
    expect(builders!.length).toBe(1);
    expect(errorRoutes!.length).toBe(1);
    expect((errorRoutes![0] as Source).status).toBe(404);
  });

  it('package.json with no build + api', async () => {
    const pkg = { dependencies: { next: '9.0.0' } };
    const files = ['package.json', 'api/[endpoint].js'];

    const { builders, errorRoutes } = await detectBuilders(files, pkg, {
      featHandleMiss,
    });
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].src).toBe('api/[endpoint].js');
    expect(builders!.length).toBe(1);
    expect(errorRoutes!.length).toBe(1);
    expect((errorRoutes![0] as Source).status).toBe(404);
  });

  it('package.json with no build + public directory', async () => {
    const pkg = { dependencies: { next: '9.0.0' } };
    const files = ['package.json', 'public/index.html'];

    const { builders, errors } = await detectBuilders(files, pkg, {
      featHandleMiss,
    });
    expect(builders).toBe(null);
    expect(errors!.length).toBe(1);
  });

  it('no package.json + api', async () => {
    const files = ['api/[endpoint].js', 'api/[endpoint]/[id].js'];

    const { builders } = await detectBuilders(files, undefined, {
      featHandleMiss,
    });
    expect(builders!.length).toBe(2);
  });

  it('no package.json + no api', async () => {
    const files = ['index.html'];

    const { builders, errors } = await detectBuilders(files, undefined, {
      featHandleMiss,
    });
    expect(builders).toBe(null);
    expect(errors).toBe(null);
  });

  it('package.json + api + canary', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      dependencies: { next: '9.0.0' },
    };
    const files = [
      'pages/index.js',
      'api/[endpoint].js',
      'api/[endpoint]/[id].js',
    ];

    const { builders } = await detectBuilders(files, pkg, {
      tag: 'canary',
      featHandleMiss,
    });
    expect(builders![0].use).toBe('@vercel/node@canary');
    expect(builders![1].use).toBe('@vercel/node@canary');
    expect(builders![2].use).toBe('@vercel/next@canary');
    expect(builders!.length).toBe(3);
  });

  it('package.json + api + latest', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      dependencies: { next: '9.0.0' },
    };
    const files = [
      'pages/index.js',
      'api/[endpoint].js',
      'api/[endpoint]/[id].js',
    ];

    const { builders } = await detectBuilders(files, pkg, {
      tag: 'latest',
      featHandleMiss,
    });
    expect(builders![0].use).toBe('@vercel/node@latest');
    expect(builders![1].use).toBe('@vercel/node@latest');
    expect(builders![2].use).toBe('@vercel/next@latest');
    expect(builders!.length).toBe(3);
  });

  it('package.json + api + random tag', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      dependencies: { next: '9.0.0' },
    };
    const files = [
      'pages/index.js',
      'api/[endpoint].js',
      'api/[endpoint]/[id].js',
    ];

    const { builders } = await detectBuilders(files, pkg, {
      tag: 'haha',
      featHandleMiss,
    });
    expect(builders![0].use).toBe('@vercel/node@haha');
    expect(builders![1].use).toBe('@vercel/node@haha');
    expect(builders![2].use).toBe('@vercel/next@haha');
    expect(builders!.length).toBe(3);
  });

  it('next.js pages/api + api', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      dependencies: { next: '9.0.0' },
    };
    const files = ['api/user.js', 'pages/api/user.js'];

    const { warnings, errors, builders } = await detectBuilders(files, pkg, {
      featHandleMiss,
    });

    expect(errors).toBe(null);
    expect(warnings[0]).toBeDefined();
    expect(warnings[0].code).toBe('conflicting_files');
    expect(builders).toBeDefined();
    expect(builders!.length).toBe(2);
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![1].use).toBe('@vercel/next');
  });

  it('many static files + one api file', async () => {
    const files = Array.from({ length: 5000 }).map((_, i) => `file${i}.html`);
    files.push('api/index.ts');
    const { builders, errorRoutes } = await detectBuilders(files, undefined, {
      featHandleMiss,
    });

    expect(builders!.length).toBe(2);
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].src).toBe('api/index.ts');
    expect(builders![1].use).toBe('@vercel/static');
    expect(builders![1].src).toBe('!{api/**,package.json}');
    expect(errorRoutes!.length).toBe(1);
    expect((errorRoutes![0] as Source).status).toBe(404);
  });

  it('functions with nextjs', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      dependencies: { next: '9.0.0' },
    };
    const functions = {
      'pages/api/teams/**': {
        memory: 128,
        maxDuration: 10,
      },
    };
    const files = [
      'package.json',
      'pages/index.js',
      'pages/api/teams/members.ts',
    ];
    const { builders, errors } = await detectBuilders(files, pkg, {
      functions,
      featHandleMiss,
    });

    expect(errors).toBe(null);
    expect(builders!.length).toBe(1);
    expect(builders![0]).toEqual({
      src: 'package.json',
      use: '@vercel/next',
      config: {
        zeroConfig: true,
        functions: {
          'pages/api/teams/**': {
            memory: 128,
            maxDuration: 10,
          },
        },
      },
    });
  });

  it('extend with functions', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      dependencies: { next: '9.0.0' },
    };
    const functions = {
      'api/users/*.ts': {
        runtime: 'my-custom-runtime-package@1.0.0',
      },
      'api/teams/members.ts': {
        memory: 128,
        maxDuration: 10,
      },
    };
    const files = [
      'package.json',
      'pages/index.js',
      'api/users/[id].ts',
      'api/teams/members.ts',
    ];
    const { builders } = await detectBuilders(files, pkg, {
      functions,
      featHandleMiss,
    });

    expect(builders!.length).toBe(3);
    expect(builders![0]).toEqual({
      src: 'api/teams/members.ts',
      use: '@vercel/node',
      config: {
        zeroConfig: true,
        functions: {
          'api/teams/members.ts': {
            memory: 128,
            maxDuration: 10,
          },
        },
      },
    });
    expect(builders![1]).toEqual({
      src: 'api/users/[id].ts',
      use: 'my-custom-runtime-package@1.0.0',
      config: {
        zeroConfig: true,
        functions: {
          'api/users/*.ts': {
            runtime: 'my-custom-runtime-package@1.0.0',
          },
        },
      },
    });
    expect(builders![2]).toEqual({
      src: 'package.json',
      use: '@vercel/next',
      config: {
        zeroConfig: true,
      },
    });
  });

  it('invalid function key', async () => {
    const functions = { ['a'.repeat(1000)]: { memory: 128 } };
    const files = ['pages/index.ts'];
    const { builders, errors } = await detectBuilders(files, null, {
      functions,
      featHandleMiss,
    });

    expect(builders).toBe(null);
    expect(errors!.length).toBe(1);
    expect(errors![0].code).toBe('invalid_function_glob');
  });

  it('invalid function maxDuration', async () => {
    const functions = { 'pages/index.ts': { maxDuration: -1 } };
    const files = ['pages/index.ts'];
    const { builders, errors } = await detectBuilders(files, null, {
      functions,
      featHandleMiss,
    });

    expect(builders).toBe(null);
    expect(errors!.length).toBe(1);
    expect(errors![0].code).toBe('invalid_function_duration');
  });

  it('invalid function memory', async () => {
    const functions = { 'pages/index.ts': { memory: 200 } };
    const files = ['pages/index.ts'];
    const { builders, errors } = await detectBuilders(files, null, {
      functions,
      featHandleMiss,
    });

    expect(builders).toBe(null);
    expect(errors!.length).toBe(1);
    expect(errors![0].code).toBe('invalid_function_memory');
  });

  it('missing runtime version', async () => {
    const functions = { 'pages/index.ts': { runtime: 'haha' } };
    const files = ['pages/index.ts'];
    const { builders, errors } = await detectBuilders(files, null, {
      functions,
      featHandleMiss,
    });

    expect(builders).toBe(null);
    expect(errors!.length).toBe(1);
    expect(errors![0].code).toBe('invalid_function_runtime');
  });

  it('use a custom runtime', async () => {
    const functions = { 'api/user.php': { runtime: 'vercel-php@0.1.0' } };
    const files = ['api/user.php'];
    const { builders, errors } = await detectBuilders(files, null, {
      functions,
      featHandleMiss,
    });

    expect(errors).toBe(null);
    expect(builders!.length).toBe(1);
    expect(builders![0].use).toBe('vercel-php@0.1.0');
  });

  it('use a custom runtime but without a source', async () => {
    const functions = { 'api/user.php': { runtime: 'vercel-php@0.1.0' } };
    const files = ['api/team.js'];
    const { errors } = await detectBuilders(files, null, {
      functions,
      featHandleMiss,
    });

    expect(errors!.length).toBe(1);
    expect(errors![0].code).toBe('unused_function');
  });

  it('do not allow empty functions', async () => {
    const functions = { 'api/user.php': {} };
    const files = ['api/user.php'];
    const { errors } = await detectBuilders(files, null, {
      functions,
      featHandleMiss,
    });

    expect(errors!.length).toBe(1);
    expect(errors![0].code).toBe('invalid_function');
  });

  it('do not allow null functions', async () => {
    const functions = { 'api/user.php': null };
    const files = ['api/user.php'];
    // @ts-ignore
    const { errors } = await detectBuilders(files, null, {
      // @ts-ignore
      functions,
      featHandleMiss,
    });

    expect(errors!.length).toBe(1);
    expect(errors![0].code).toBe('invalid_function');
  });

  it('Do not allow functions that are not used by @vercel/next', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      dependencies: { next: '9.0.0' },
    };
    const functions = { 'test.js': { memory: 1024 } };
    const files = ['pages/index.js', 'test.js'];

    const { errors } = await detectBuilders(files, pkg, {
      functions,
      featHandleMiss,
    });

    expect(errors).toBeDefined();
    expect(errors![0].code).toBe('unused_function');
  });

  it('Must include includeFiles config property', async () => {
    const functions = {
      'api/test.js': { includeFiles: 'text/include.txt' },
    };
    const files = ['api/test.js'];

    const { builders, errors } = await detectBuilders(files, null, {
      functions,
      featHandleMiss,
    });

    expect(errors).toBe(null);
    expect(builders).not.toBe(null);
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].config).toMatchObject({
      functions,
      zeroConfig: true,
      includeFiles: 'text/include.txt',
    });
  });

  it('Must include excludeFiles config property', async () => {
    const functions = {
      'api/test.js': { excludeFiles: 'text/exclude.txt' },
    };
    const files = ['api/test.js'];

    const { builders, errors } = await detectBuilders(files, null, {
      functions,
      featHandleMiss,
    });

    expect(errors).toBe(null);
    expect(builders).not.toBe(null);
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].config).toMatchObject({
      functions,
      zeroConfig: true,
      excludeFiles: 'text/exclude.txt',
    });
  });

  it('Must include excludeFiles and includeFiles config property', async () => {
    const functions = {
      'api/test.js': {
        excludeFiles: 'text/exclude.txt',
        includeFiles: 'text/include.txt',
      },
    };
    const files = ['api/test.js'];

    const { builders, errors } = await detectBuilders(files, null, {
      functions,
      featHandleMiss,
    });

    expect(errors).toBe(null);
    expect(builders).not.toBe(null);
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![0].config).toMatchObject({
      functions,
      zeroConfig: true,
      excludeFiles: 'text/exclude.txt',
      includeFiles: 'text/include.txt',
    });
  });

  it('Must fail for includeFiles config property', async () => {
    const functions = {
      'api/test.js': { includeFiles: { test: 1 } },
    };
    const files = ['api/test.js'];

    // @ts-ignore
    const { errors } = await detectBuilders(files, null, {
      // @ts-ignore
      functions,
      featHandleMiss,
    });

    expect(errors).not.toBe(null);
    expect(errors![0].code).toBe('invalid_function_property');
  });

  it('Must fail for excludeFiles config property', async () => {
    const functions = {
      'api/test.js': { excludeFiles: { test: 1 } },
    };
    const files = ['api/test.js'];

    // @ts-ignore: Since we test an invalid type
    const { errors } = await detectBuilders(files, null, {
      // @ts-ignore
      functions,
      featHandleMiss,
    });

    expect(errors).not.toBe(null);
    expect(errors![0].code).toBe('invalid_function_property');
  });

  it('Must fail when function patterns start with a slash', async () => {
    const functions = {
      '/api/test.js': { memory: 128 },
    };
    const files = ['api/test.js', '/api/test.js'];

    const { errors } = await detectBuilders(files, null, {
      functions,
      featHandleMiss,
    });

    expect(errors).not.toBe(null);
    expect(errors![0].code).toBe('invalid_function_source');
  });

  it('Custom static output directory', async () => {
    const projectSettings = {
      outputDirectory: 'dist',
    };

    const files = ['dist/index.html', 'dist/style.css'];

    const {
      builders,
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
      errorRoutes,
    } = await detectBuilders(files, null, {
      projectSettings,
      featHandleMiss,
    });

    expect(builders!.length).toBe(1);
    expect(builders![0].src).toBe('dist/**/*');
    expect(builders![0].use).toBe('@vercel/static');

    expect(defaultRoutes).toStrictEqual([]);
    expect(redirectRoutes).toStrictEqual([]);
    expect(rewriteRoutes).toStrictEqual([]);
    expect(errorRoutes!.length).toBe(1);
    expect((errorRoutes![0] as Source).status).toBe(404);
  });

  it('Custom static output directory with api', async () => {
    const projectSettings = {
      outputDirectory: 'output',
    };

    const files = ['api/user.ts', 'output/index.html', 'output/style.css'];

    const {
      builders,
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
      errorRoutes,
    } = await detectBuilders(files, null, {
      projectSettings,
      featHandleMiss,
    });

    expect(builders!.length).toBe(2);
    expect(builders![1].src).toBe('output/**/*');
    expect(builders![1].use).toBe('@vercel/static');

    expect(defaultRoutes!.length).toBe(2);
    expect((defaultRoutes![0] as Handler).handle).toBe('miss');
    expect((defaultRoutes![1] as Source).dest).toBe('/api/$1');
    expect(redirectRoutes).toStrictEqual([]);
    expect(rewriteRoutes!.length).toBe(1);
    expect((rewriteRoutes![0] as Source).status).toBe(404);
    expect(errorRoutes!.length).toBe(1);
    expect((errorRoutes![0] as Source).status).toBe(404);
  });

  it('Framework with non-package.json entrypoint', async () => {
    const files = ['config.yaml'];
    const projectSettings = {
      framework: 'hugo',
    };

    const { builders, errorRoutes } = await detectBuilders(files, null, {
      projectSettings,
      featHandleMiss,
    });

    expect(builders).toEqual([
      {
        use: '@vercel/static-build',
        src: 'config.yaml',
        config: {
          zeroConfig: true,
          framework: 'hugo',
        },
      },
    ]);
    expect(errorRoutes!.length).toBe(1);
    expect((errorRoutes![0] as Source).status).toBe(404);
  });

  const redwoodFiles = [
    'package.json',
    'web/package.json',
    'web/public/robots.txt',
    'web/src/index.html',
    'web/src/index.css',
    'web/src/index.js',
    'api/package.json',
    'api/prisma/seeds.js',
    'api/src/functions/graphql.js',
    'api/src/graphql/.keep',
    'api/src/services/.keep',
    'api/src/lib/db.js',
  ];

  it('RedwoodJS should only use Redwood builder and not Node builder', async () => {
    const files = [...redwoodFiles].sort();
    const projectSettings = {
      framework: 'redwoodjs',
    };

    const {
      builders,
      defaultRoutes,
      rewriteRoutes,
      errorRoutes,
    } = await detectBuilders(files, null, {
      projectSettings,
      featHandleMiss,
    });

    expect(builders).toStrictEqual([
      {
        use: '@vercel/redwood',
        src: 'package.json',
        config: {
          zeroConfig: true,
          framework: 'redwoodjs',
        },
      },
    ]);
    expect(defaultRoutes).toStrictEqual([]);
    expect(rewriteRoutes).toStrictEqual([]);
    expect(errorRoutes).toStrictEqual([
      {
        status: 404,
        src: '^/(?!.*api).*$',
        dest: '/404.html',
      },
    ]);
  });

  it('RedwoodJS should allow usage of non-js API and not add 404 api route', async () => {
    const files = [...redwoodFiles, 'api/golang.go', 'api/python.py'].sort();
    const projectSettings = {
      framework: 'redwoodjs',
    };

    const {
      builders,
      defaultRoutes,
      rewriteRoutes,
      errorRoutes,
    } = await detectBuilders(files, null, {
      projectSettings,
      featHandleMiss,
    });

    expect(builders).toStrictEqual([
      {
        use: '@vercel/go',
        src: 'api/golang.go',
        config: {
          zeroConfig: true,
        },
      },
      {
        use: '@vercel/python',
        src: 'api/python.py',
        config: {
          zeroConfig: true,
        },
      },
      {
        use: '@vercel/redwood',
        src: 'package.json',
        config: {
          zeroConfig: true,
          framework: 'redwoodjs',
        },
      },
    ]);
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        src: '^/api/(.+)(?:\\.(?:go|py))$',
        dest: '/api/$1',
        check: true,
      },
    ]);
    expect(rewriteRoutes).toStrictEqual([]);
    expect(errorRoutes).toStrictEqual([
      {
        status: 404,
        src: '^/(?!.*api).*$',
        dest: '/404.html',
      },
    ]);
  });

  it('No framework, only package.json', async () => {
    const files = ['package.json'];
    const pkg = {
      scripts: {
        build: 'build.sh',
      },
    };

    const { builders, errorRoutes } = await detectBuilders(files, pkg, {
      featHandleMiss,
    });

    expect(builders).toEqual([
      {
        use: '@vercel/static-build',
        src: 'package.json',
        config: {
          zeroConfig: true,
        },
      },
    ]);
    expect(errorRoutes!.length).toBe(1);
    expect((errorRoutes![0] as Source).status).toBe(404);
  });

  it('Framework with an API', async () => {
    const files = ['config.rb', 'api/date.rb'];
    const projectSettings = { framework: 'middleman' };

    const { builders, errorRoutes } = await detectBuilders(files, null, {
      projectSettings,
      featHandleMiss,
    });

    expect(builders).toEqual([
      {
        use: '@vercel/ruby',
        src: 'api/date.rb',
        config: {
          zeroConfig: true,
        },
      },
      {
        use: '@vercel/static-build',
        src: 'config.rb',
        config: {
          zeroConfig: true,
          framework: 'middleman',
        },
      },
    ]);
    expect(errorRoutes!.length).toBe(1);
    expect((errorRoutes![0] as Source).status).toBe(404);
  });

  it('Error for non-api functions', async () => {
    const files = ['server/hello.ts', 'public/index.html'];
    const functions = {
      'server/**/*.ts': {
        runtime: '@vercel/node@1.3.1',
      },
    };

    const { errors } = await detectBuilders(files, null, {
      functions,
      featHandleMiss,
    });

    expect(errors).toEqual([
      {
        code: 'unused_function',
        message: `The pattern "server/**/*.ts" defined in \`functions\` doesn't match any Serverless Functions inside the \`api\` directory.`,
        action: 'Learn More',
        link: 'https://vercel.link/unmatched-function-pattern',
      },
    ]);
  });

  it('All static if `buildCommand` is an empty string', async () => {
    const files = ['index.html'];
    const projectSettings = { buildCommand: '' };
    const { builders, errors } = await detectBuilders(files, null, {
      projectSettings,
      featHandleMiss,
    });
    expect(errors).toBe(null);
    expect(builders).toBe(null);
  });

  it('All static if `outputDirectory` is an empty string', async () => {
    const files = ['index.html'];
    const projectSettings = { outputDirectory: '' };
    const { builders, errors } = await detectBuilders(files, null, {
      projectSettings,
      featHandleMiss,
    });
    expect(errors).toBe(null);
    expect(builders).toBe(null);
  });

  it('All static if `buildCommand` is an empty string with an `outputDirectory`', async () => {
    const files = ['out/index.html'];
    const projectSettings = { buildCommand: '', outputDirectory: 'out' };
    const { builders, errors, errorRoutes } = await detectBuilders(
      files,
      null,
      {
        projectSettings,
        featHandleMiss,
      }
    );
    expect(errors).toBe(null);
    expect(builders![0]!.use).toBe('@vercel/static');
    expect(builders![0]!.src).toBe('out/**/*');
    expect(errorRoutes!.length).toBe(1);
    expect((errorRoutes![0] as Source).status).toBe(404);
  });

  it('do not require build script when `buildCommand` is an empty string', async () => {
    const files = ['index.html', 'about.html', 'package.json'];
    const projectSettings = { buildCommand: '', outputDirectory: '' };
    const pkg = {
      scripts: {
        build: 'false',
      },
    };

    const { builders, errors } = await detectBuilders(files, pkg, {
      projectSettings,
      featHandleMiss,
    });
    expect(builders).toBe(null);
    expect(errors).toBe(null);
  });
});

it('Test `detectRoutes`', async () => {
  {
    const files = ['api/user.go', 'api/team.js', 'api/package.json'];

    const { defaultRoutes } = await detectBuilders(files);
    expect(defaultRoutes!.length).toBe(3);
    expect((defaultRoutes![0] as any).dest).toBe('/api/team.js');
    expect((defaultRoutes![1] as any).dest).toBe('/api/user.go');
    expect((defaultRoutes![2] as any).dest).not.toBeDefined();
    expect((defaultRoutes![2] as any).status).toBe(404);
  }

  {
    const files = ['api/user.go', 'api/user.js'];

    const { errors } = await detectBuilders(files);
    expect(errors![0]!.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[user].go', 'api/[team]/[id].js'];

    const { errors } = await detectBuilders(files);
    expect(errors![0]!.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[team]/[team].js'];

    const { errors } = await detectBuilders(files);
    expect(errors![0]!.code).toBe('conflicting_path_segment');
  }

  {
    const files = ['api/date/index.js', 'api/date/index.go'];

    const { defaultRoutes, errors } = await detectBuilders(files);
    expect(defaultRoutes).toBe(null);
    expect(errors![0]!.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[endpoint].js', 'api/[endpoint]/[id].js'];

    const { defaultRoutes } = await detectBuilders(files);
    expect(defaultRoutes!.length).toBe(3);
  }

  {
    const files = [
      'public/index.html',
      'api/[endpoint].js',
      'api/[endpoint]/[id].js',
    ];

    const { defaultRoutes } = await detectBuilders(files);
    expect((defaultRoutes![2] as any).status).toBe(404);
    expect((defaultRoutes![2] as any).src).toBe('^/api(/.*)?$');
    expect((defaultRoutes![3] as any).src).toBe('/(.*)');
    expect((defaultRoutes![3] as any).dest).toBe('/public/$1');
    expect(defaultRoutes!.length).toBe(4);
  }

  {
    const pkg = {
      scripts: { build: 'next build' },
      devDependencies: { next: '9.0.0' },
    };
    const files = ['public/index.html', 'api/[endpoint].js'];

    const { defaultRoutes } = await detectBuilders(files, pkg);
    expect((defaultRoutes![1] as any).status).toBe(404);
    expect((defaultRoutes![1] as any).src).toBe('^/api(/.*)?$');
    expect(defaultRoutes!.length).toBe(2);
  }

  {
    const files = ['public/index.html'];

    const { defaultRoutes } = await detectBuilders(files);

    expect(defaultRoutes!.length).toBe(1);
  }

  {
    const files = ['api/date/index.js', 'api/date.js'];

    const { defaultRoutes } = await detectBuilders(files);

    expect(defaultRoutes!.length).toBe(3);
    expect((defaultRoutes![0] as any).src).toBe(
      '^/api/date(/|/index|/index\\.js)?$'
    );
    expect((defaultRoutes![0] as any).dest).toBe('/api/date/index.js');
    expect((defaultRoutes![1] as any).src).toBe(
      '^/api/(date/|date|date\\.js)$'
    );
    expect((defaultRoutes![1] as any).dest).toBe('/api/date.js');
  }

  {
    const files = ['api/date.js', 'api/[date]/index.js'];

    const { defaultRoutes } = await detectBuilders(files);

    expect(defaultRoutes!.length).toBe(3);
    expect((defaultRoutes![0] as any).src).toBe(
      '^/api/([^/]+)(/|/index|/index\\.js)?$'
    );
    expect((defaultRoutes![0] as any).dest).toBe(
      '/api/[date]/index.js?date=$1'
    );
    expect((defaultRoutes![1] as any).src).toBe(
      '^/api/(date/|date|date\\.js)$'
    );
    expect((defaultRoutes![1] as any).dest).toBe('/api/date.js');
  }

  {
    const files = [
      'api/index.ts',
      'api/index.d.ts',
      'api/users/index.ts',
      'api/users/index.d.ts',
      'api/food.ts',
      'api/ts/gold.ts',
    ];
    const { builders, defaultRoutes } = await detectBuilders(files);

    expect(builders!.length).toBe(4);
    expect(builders![0].use).toBe('@vercel/node');
    expect(builders![1].use).toBe('@vercel/node');
    expect(builders![2].use).toBe('@vercel/node');
    expect(builders![3].use).toBe('@vercel/node');
    expect(defaultRoutes!.length).toBe(5);
  }

  {
    // use a custom runtime
    const functions = { 'api/user.php': { runtime: 'vercel-php@0.1.0' } };
    const files = ['api/user.php'];

    const { defaultRoutes } = await detectBuilders(files, null, { functions });

    expect(defaultRoutes!.length).toBe(2);
    expect((defaultRoutes![0] as any).dest).toBe('/api/user.php');
  }
});

it('Test `detectRoutes` with `featHandleMiss=true`', async () => {
  const featHandleMiss = true;

  {
    const files = ['api/user.go', 'api/team.js', 'api/package.json'];

    const { defaultRoutes, rewriteRoutes, errorRoutes } = await detectBuilders(
      files,
      null,
      {
        featHandleMiss,
      }
    );
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        src: '^/api/(.+)(?:\\.(?:js|go))$',
        dest: '/api/$1',
        check: true,
      },
    ]);
    expect(rewriteRoutes).toStrictEqual([
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
    expect(errorRoutes).toStrictEqual([
      {
        status: 404,
        src: '^/(?!.*api).*$',
        dest: '/404.html',
      },
    ]);

    const pattern = new RegExp(errorRoutes![0].src!);

    [
      '/',
      '/index.html',
      '/page.html',
      '/page',
      '/another/index.html',
      '/another/page.html',
      '/another/page',
      '/another/sub/index.html',
      '/another/sub/page.html',
      '/another/sub/page',
    ].forEach(file => {
      expect(file).toMatch(pattern);
    });

    [
      '/api',
      '/api/',
      '/api/index.html',
      '/api/page.html',
      '/api/page',
      '/api/sub',
      '/api/sub/index.html',
      '/api/sub/page.html',
      '/api/sub/page',
    ].forEach(file => {
      expect(file).not.toMatch(pattern);
    });
  }

  {
    const files = ['api/user.go', 'api/user.js'];

    const { errors } = await detectBuilders(files, null, { featHandleMiss });
    expect(errors![0]!.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[user].go', 'api/[team]/[id].js'];

    const { errors } = await detectBuilders(files, null, { featHandleMiss });
    expect(errors![0]!.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[team]/[team].js'];

    const { errors } = await detectBuilders(files, null, { featHandleMiss });
    expect(errors![0]!.code).toBe('conflicting_path_segment');
  }

  {
    const files = ['api/date/index.js', 'api/date/index.go'];

    const { defaultRoutes, errors } = await detectBuilders(files, null, {
      featHandleMiss,
    });
    expect(defaultRoutes).toBe(null);
    expect(errors![0]!.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[endpoint].js', 'api/[endpoint]/[id].js'];

    const { defaultRoutes, rewriteRoutes } = await detectBuilders(files, null, {
      featHandleMiss,
    });
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        src: '^/api/(.+)(?:\\.(?:js))$',
        dest: '/api/$1',
        check: true,
      },
    ]);
    expect(rewriteRoutes).toStrictEqual([
      {
        src: '^/api/([^/]+)/([^/]+)$',
        dest: '/api/[endpoint]/[id]?endpoint=$1&id=$2',
        check: true,
      },
      {
        src: '^/api/([^/]+)$',
        dest: '/api/[endpoint]?endpoint=$1',
        check: true,
      },
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
  }

  {
    const files = [
      'public/index.html',
      'api/[endpoint].js',
      'api/[endpoint]/[id].js',
    ];

    const { defaultRoutes, rewriteRoutes } = await detectBuilders(files, null, {
      featHandleMiss,
    });
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        src: '^/api/(.+)(?:\\.(?:js))$',
        dest: '/api/$1',
        check: true,
      },
    ]);

    expect(rewriteRoutes).toStrictEqual([
      {
        src: '^/api/([^/]+)/([^/]+)$',
        dest: '/api/[endpoint]/[id]?endpoint=$1&id=$2',
        check: true,
      },
      {
        src: '^/api/([^/]+)$',
        dest: '/api/[endpoint]?endpoint=$1',
        check: true,
      },
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
  }

  {
    const pkg = {
      scripts: {
        build: 'next build',
      },
      framework: {
        slug: 'next',
        version: '9.0.0',
      },
    };

    const files = ['public/index.html', 'api/[endpoint].js'];

    const { defaultRoutes, rewriteRoutes } = await detectBuilders(files, pkg, {
      featHandleMiss,
    });
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        src: '^/api/(.+)(?:\\.(?:js))$',
        dest: '/api/$1',
        check: true,
      },
    ]);
    expect(rewriteRoutes).toStrictEqual([
      {
        src: '^/api/([^/]+)$',
        dest: '/api/[endpoint]?endpoint=$1',
        check: true,
      },
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
  }

  {
    const files = ['public/index.html'];

    const { defaultRoutes } = await detectBuilders(files, null, {
      featHandleMiss,
    });
    expect(defaultRoutes).toStrictEqual([]);
  }

  {
    const files = ['api/date/index.js', 'api/date.js'];

    const { defaultRoutes, rewriteRoutes } = await detectBuilders(files, null, {
      featHandleMiss,
    });
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        src: '^/api/(.+)(?:\\.(?:js))$',
        dest: '/api/$1',
        check: true,
      },
    ]);

    expect(rewriteRoutes).toStrictEqual([
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
  }

  {
    const files = ['api/date.js', 'api/[date]/index.js'];

    const { defaultRoutes, rewriteRoutes } = await detectBuilders(files, null, {
      featHandleMiss,
    });
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        src: '^/api/(.+)(?:\\.(?:js))$',
        dest: '/api/$1',
        check: true,
      },
    ]);
    expect(rewriteRoutes).toStrictEqual([
      {
        src: '^/api/([^/]+)(/|/index|/index\\.js)?$',
        dest: '/api/[date]/index?date=$1',
        check: true,
      },
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
  }

  {
    const files = [
      'api/index.ts',
      'api/index.d.ts',
      'api/users/index.ts',
      'api/users/index.d.ts',
      'api/food.ts',
      'api/ts/gold.ts',
    ];
    const { defaultRoutes, rewriteRoutes } = await detectBuilders(files, null, {
      featHandleMiss,
    });

    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        src: '^/api/(.+)(?:\\.(?:ts))$',
        dest: '/api/$1',
        check: true,
      },
    ]);

    expect(rewriteRoutes).toStrictEqual([
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
  }

  {
    // use a custom runtime
    const functions = { 'api/user.php': { runtime: 'vercel-php@0.1.0' } };
    const files = ['api/user.php'];

    const { defaultRoutes, rewriteRoutes } = await detectBuilders(files, null, {
      functions,
      featHandleMiss,
    });
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        src: '^/api/(.+)(?:\\.(?:php))$',
        dest: '/api/$1',
        check: true,
      },
    ]);

    expect(rewriteRoutes).toStrictEqual([
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
  }
});

it('Test `detectRoutes` with `featHandleMiss=true`, `cleanUrls=true`', async () => {
  const options = {
    featHandleMiss: true,
    cleanUrls: true,
  };

  const testHeaders = (redirectRoutes: Route[] | null) => {
    if (!redirectRoutes || redirectRoutes.length === 0) {
      throw new Error('Expected one redirect but found none');
    }
    expect(redirectRoutes).toBeDefined();
    expect(redirectRoutes.length).toBe(2);
  };

  {
    const files = ['api/user.go', 'api/team.js', 'api/package.json'];

    const {
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
      errorRoutes,
    } = await detectBuilders(files, null, options);
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([]);
    expect(rewriteRoutes).toStrictEqual([
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
    expect(errorRoutes).toStrictEqual([
      {
        status: 404,
        src: '^/(?!.*api).*$',
        dest: '/404',
      },
    ]);

    // expected redirect should match inputs
    const getLocation = createReplaceLocation(redirectRoutes);

    expect(getLocation('/api/index')).toBe('/api');
    expect(getLocation('/api/index.js')).toBe('/api');
    expect(getLocation('/api/user.js')).toBe('/api/user');
    expect(getLocation('/api/user.prod.js')).toBe('/api/user.prod');
    expect(getLocation('/api/user/index.js')).toBe('/api/user');

    expect(getLocation('/api/index.go')).toBe('/api');
    expect(getLocation('/api/user.go')).toBe('/api/user');
    expect(getLocation('/api/user.prod.go')).toBe('/api/user.prod');
    expect(getLocation('/api/user/index.go')).toBe('/api/user');

    expect(getLocation('/api/index.cpp')).toBe(null);
    expect(getLocation('/api/user.cpp')).toBe(null);
    expect(getLocation('/api/user.prod.cpp')).toBe(null);
    expect(getLocation('/api/user/index.cpp')).toBe(null);

    expect(getLocation('/api/user')).toBe(null);
    expect(getLocation('/api/user/get')).toBe(null);
    expect(getLocation('/apiindex')).toBe(null);
    expect(getLocation('/api-index')).toBe(null);
    expect(getLocation('/apiuserindex')).toBe(null);
    expect(getLocation('/apiuser-index')).toBe(null);
  }

  {
    const files = ['api/user.go', 'api/user.js'];

    const { errors } = await detectBuilders(files, null, options);
    expect(errors![0]!.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[user].go', 'api/[team]/[id].js'];

    const { errors } = await detectBuilders(files, null, options);
    expect(errors![0]!.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[team]/[team].js'];

    const { errors } = await detectBuilders(files, null, options);
    expect(errors![0]!.code).toBe('conflicting_path_segment');
  }

  {
    const files = ['api/date/index.js', 'api/date/index.go'];

    const { defaultRoutes, errors } = await detectBuilders(
      files,
      null,
      options
    );
    expect(defaultRoutes).toBe(null);
    expect(errors![0]!.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[endpoint].js', 'api/[endpoint]/[id].js'];

    const {
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
    } = await detectBuilders(files, null, options);
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([]);
    expect(rewriteRoutes).toStrictEqual([
      {
        src: '^/api/([^/]+)/([^/]+)$',
        dest: '/api/[endpoint]/[id]?endpoint=$1&id=$2',
        check: true,
      },
      {
        src: '^/api/([^/]+)$',
        dest: '/api/[endpoint]?endpoint=$1',
        check: true,
      },
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
  }

  {
    const files = [
      'public/index.html',
      'api/[endpoint].js',
      'api/[endpoint]/[id].js',
    ];

    const {
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
    } = await detectBuilders(files, null, options);
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([]);
    expect(rewriteRoutes).toStrictEqual([
      {
        src: '^/api/([^/]+)/([^/]+)$',
        dest: '/api/[endpoint]/[id]?endpoint=$1&id=$2',
        check: true,
      },
      {
        src: '^/api/([^/]+)$',
        dest: '/api/[endpoint]?endpoint=$1',
        check: true,
      },
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
  }

  {
    const pkg = {
      scripts: {
        build: 'next build',
      },
      framework: {
        slug: 'next',
        version: '9.0.0',
      },
    };

    const files = ['public/index.html', 'api/[endpoint].js'];

    const {
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
    } = await detectBuilders(files, pkg, options);
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([]);
    expect(rewriteRoutes).toStrictEqual([
      {
        src: '^/api/([^/]+)$',
        dest: '/api/[endpoint]?endpoint=$1',
        check: true,
      },
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
  }

  {
    const files = ['public/index.html'];

    const { defaultRoutes } = await detectBuilders(files, null, options);
    expect(defaultRoutes).toStrictEqual([]);
  }

  {
    const files = ['api/date/index.js', 'api/date.js'];

    const {
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
    } = await detectBuilders(files, null, options);
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([]);
    expect(rewriteRoutes).toStrictEqual([
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
  }

  {
    const files = ['api/date.js', 'api/[date]/index.js'];

    const {
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
    } = await detectBuilders(files, null, options);
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([]);
    expect(rewriteRoutes).toStrictEqual([
      {
        src: '^/api/([^/]+)(/|/index)?$',
        dest: '/api/[date]/index?date=$1',
        check: true,
      },
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
  }

  {
    const files = [
      'api/index.ts',
      'api/index.d.ts',
      'api/users/index.ts',
      'api/users/index.d.ts',
      'api/food.ts',
      'api/ts/gold.ts',
    ];
    const {
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
    } = await detectBuilders(files, null, options);
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([]);
    expect(rewriteRoutes).toStrictEqual([
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
  }

  {
    // use a custom runtime
    const functions = { 'api/user.php': { runtime: 'vercel-php@0.1.0' } };
    const files = ['api/user.php'];

    const {
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
    } = await detectBuilders(files, null, { functions, ...options });
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([]);
    expect(rewriteRoutes).toStrictEqual([
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
  }
});

it('Test `detectRoutes` with `featHandleMiss=true`, `cleanUrls=true`, `trailingSlash=true`', async () => {
  const options = {
    featHandleMiss: true,
    cleanUrls: true,
    trailingSlash: true,
  };

  const testHeaders = (redirectRoutes: Route[] | null) => {
    if (!redirectRoutes || redirectRoutes.length === 0) {
      throw new Error('Expected one redirect but found none');
    }
    expect(redirectRoutes).toBeDefined();
    expect(redirectRoutes.length).toBe(2);
  };

  {
    const files = ['api/user.go', 'api/team.js', 'api/package.json'];

    const {
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
    } = await detectBuilders(files, null, options);
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([]);
    expect(rewriteRoutes).toStrictEqual([
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);

    // expected redirect should match inputs
    const getLocation = createReplaceLocation(redirectRoutes);

    expect(getLocation('/api/index')).toBe('/api/');
    expect(getLocation('/api/index.js')).toBe('/api/');
    expect(getLocation('/api/user.js')).toBe('/api/user/');
    expect(getLocation('/api/user.prod.js')).toBe('/api/user.prod/');
    expect(getLocation('/api/user/index.js')).toBe('/api/user/');

    expect(getLocation('/api/index.go')).toBe('/api/');
    expect(getLocation('/api/user.go')).toBe('/api/user/');
    expect(getLocation('/api/user.prod.go')).toBe('/api/user.prod/');
    expect(getLocation('/api/user/index.go')).toBe('/api/user/');

    expect(getLocation('/api/index.cpp')).toBe(null);
    expect(getLocation('/api/user.cpp')).toBe(null);
    expect(getLocation('/api/user.prod.cpp')).toBe(null);
    expect(getLocation('/api/user/index.cpp')).toBe(null);

    expect(getLocation('/api/user')).toBe(null);
    expect(getLocation('/api/user/get')).toBe(null);
    expect(getLocation('/apiindex')).toBe(null);
    expect(getLocation('/api.index')).toBe(null);
    expect(getLocation('/api.index.js')).toBe(null);
    expect(getLocation('/api-index')).toBe(null);
    expect(getLocation('/apiuser.index')).toBe(null);
    expect(getLocation('/apiuser-index')).toBe(null);
    expect(getLocation('/apiuser-index')).toBe(null);
  }

  {
    const files = ['api/[endpoint].js', 'api/[endpoint]/[id].js'];

    const {
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
    } = await detectBuilders(files, null, options);
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([]);
    expect(rewriteRoutes).toStrictEqual([
      {
        src: '^/api/([^/]+)/([^/]+)$',
        dest: '/api/[endpoint]/[id]?endpoint=$1&id=$2',
        check: true,
      },
      {
        src: '^/api/([^/]+)$',
        dest: '/api/[endpoint]?endpoint=$1',
        check: true,
      },
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
  }

  {
    const files = [
      'public/index.html',
      'api/[endpoint].js',
      'api/[endpoint]/[id].js',
    ];

    const {
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
    } = await detectBuilders(files, null, options);
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([]);
    expect(rewriteRoutes).toStrictEqual([
      {
        src: '^/api/([^/]+)/([^/]+)$',
        dest: '/api/[endpoint]/[id]?endpoint=$1&id=$2',
        check: true,
      },
      {
        src: '^/api/([^/]+)$',
        dest: '/api/[endpoint]?endpoint=$1',
        check: true,
      },
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
  }

  {
    const pkg = {
      scripts: {
        build: 'next build',
      },
      framework: {
        slug: 'next',
        version: '9.0.0',
      },
    };

    const files = ['public/index.html', 'api/[endpoint].js'];

    const {
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
    } = await detectBuilders(files, pkg, options);
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([]);
    expect(rewriteRoutes).toStrictEqual([
      {
        src: '^/api/([^/]+)$',
        dest: '/api/[endpoint]?endpoint=$1',
        check: true,
      },
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
  }

  {
    const files = ['api/date/index.js', 'api/date.js'];

    const {
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
    } = await detectBuilders(files, null, options);
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([]);
    expect(rewriteRoutes).toStrictEqual([
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
  }

  {
    const files = ['api/date.js', 'api/[date]/index.js'];

    const {
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
    } = await detectBuilders(files, null, options);
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([]);
    expect(rewriteRoutes).toStrictEqual([
      {
        src: '^/api/([^/]+)(/|/index)?$',
        dest: '/api/[date]/index?date=$1',
        check: true,
      },
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
  }

  {
    const files = [
      'api/index.ts',
      'api/index.d.ts',
      'api/users/index.ts',
      'api/users/index.d.ts',
      'api/food.ts',
      'api/ts/gold.ts',
    ];
    const {
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
    } = await detectBuilders(files, null, options);
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([]);
    expect(rewriteRoutes).toStrictEqual([
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
  }

  {
    // use a custom runtime
    const functions = { 'api/user.php': { runtime: 'vercel-php@0.1.0' } };
    const files = ['api/user.php'];

    const {
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
    } = await detectBuilders(files, null, { functions, ...options });
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([]);
    expect(rewriteRoutes).toStrictEqual([
      {
        status: 404,
        src: '^/api(/.*)?$',
      },
    ]);
  }
});

describe('Test `detectOutputDirectory`', () => {
  it('should be `null` with no config', async () => {
    const builders = [
      {
        use: '@vercel/static',
        src: 'public/**/*',
      },
    ];
    const result = detectOutputDirectory(builders);
    expect(result).toBe(null);
  });

  it('should be `null` with no zero config builds', async () => {
    const builders = [
      {
        use: '@vercel/static',
        src: 'public/**/*',
        config: {},
      },
    ];
    const result = detectOutputDirectory(builders);
    expect(result).toBe(null);
  });

  it('should be `public` with one zero config', async () => {
    const builders = [
      {
        use: '@vercel/static',
        src: 'public/**/*',
        config: { zeroConfig: true },
      },
    ];
    const result = detectOutputDirectory(builders);
    expect(result).toBe('public');
  });

  it('should be `public` with one zero config and one without config', async () => {
    const builders = [
      {
        use: '@vercel/static',
        src: 'public/**/*',
        config: { zeroConfig: true },
      },
      {
        use: '@vercel/node',
        src: 'api/index.js',
      },
    ];
    const result = detectOutputDirectory(builders);
    expect(result).toBe('public');
  });
});

describe('Test `detectApiDirectory`', () => {
  it('should be `null` with no config', async () => {
    const builders = [
      {
        use: '@vercel/node',
        src: 'api/**/*.js',
      },
    ];
    const result = detectApiDirectory(builders);
    expect(result).toBe(null);
  });

  it('should be `null` with no zero config builds', async () => {
    const builders = [
      {
        use: '@vercel/node',
        src: 'api/**/*.js',
        config: {},
      },
    ];
    const result = detectApiDirectory(builders);
    expect(result).toBe(null);
  });

  it('should be `api` with one zero config', async () => {
    const builders = [
      {
        use: '@vercel/node',
        src: 'api/**/*.js',
        config: { zeroConfig: true },
      },
    ];
    const result = detectApiDirectory(builders);
    expect(result).toBe('api');
  });

  it('should be `api` with one zero config and one without config', async () => {
    const builders = [
      {
        use: '@vercel/node',
        src: 'api/**/*.js',
        config: { zeroConfig: true },
      },
      {
        use: '@vercel/php',
        src: 'api/**/*.php',
      },
    ];
    const result = detectApiDirectory(builders);
    expect(result).toBe('api');
  });

  it('should be `null` with zero config but without api directory', async () => {
    const builders = [
      {
        use: '@vercel/next',
        src: 'package.json',
        config: { zeroConfig: true },
      },
    ];
    const result = detectApiDirectory(builders);
    expect(result).toBe(null);
  });
});

describe('Test `detectApiExtensions`', () => {
  it('should have correct extensions', async () => {
    const builders = [
      {
        use: '@vercel/node',
        src: 'api/**/*.js',
        config: {
          zeroConfig: true,
        },
      },
      {
        use: '@vercel/python',
        src: 'api/**/*.py',
        config: {
          zeroConfig: true,
        },
      },
      {
        use: '@vercel/go',
        src: 'api/**/*.go',
        config: {
          zeroConfig: true,
        },
      },
      {
        use: '@vercel/ruby',
        src: 'api/**/*.rb',
        config: {
          zeroConfig: true,
        },
      },
      {
        use: 'now-bash',
        src: 'api/**/*.sh',
        // No zero config so it should not be added
      },
      {
        use: 'now-no-extension',
        src: 'api/executable',
        // No extension should not be added
        config: {
          zeroConfig: true,
        },
      },
      {
        use: '@vercel/next',
        src: 'package.json',
        // No api directory should not be added
        config: {
          zeroConfig: true,
        },
      },
      {
        use: 'now-rust@1.0.1',
        src: 'api/user.rs',
        config: {
          zeroConfig: true,
          functions: {
            'api/**/*.rs': {
              runtime: 'now-rust@1.0.1',
            },
          },
        },
      },
    ];
    const result = detectApiExtensions(builders);
    expect(result.size).toBe(5);
    expect(result.has('.js')).toBe(true);
    expect(result.has('.py')).toBe(true);
    expect(result.has('.go')).toBe(true);
    expect(result.has('.rb')).toBe(true);
    expect(result.has('.rs')).toBe(true);
  });
});

/**
 * Create a function that will replace matched redirects
 * similar to how it works with `now-proxy` in production.
 */
function createReplaceLocation(redirectRoutes: Route[] | null) {
  const redirectSources = (redirectRoutes || []) as Source[];
  return (filePath: string): string | null => {
    for (const r of redirectSources) {
      const m = new RegExp(r.src).exec(filePath);
      if (m && r.headers) {
        const match = m[1] || '';
        return r.headers['Location'].replace('$1', match);
      }
    }
    return null;
  };
}
