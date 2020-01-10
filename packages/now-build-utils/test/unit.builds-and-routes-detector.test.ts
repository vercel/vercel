import { Source, Route } from '@now/routing-utils';
import { detectBuilders, detectRoutes } from '../src';

describe('Test `detectBuilders`', () => {
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
    expect(builders![0].use).toBe('@now/next');
    expect(errors).toBe(null);
  });

  it('package.json + no build + next', async () => {
    const pkg = {
      scripts: { build: 'next build' },
      devDependencies: { next: '9.0.0' },
    };
    const files = ['package.json', 'pages/index.js'];
    const { builders, errors } = await detectBuilders(files, pkg);
    expect(builders![0].use).toBe('@now/next');
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
    expect(builders![1].use).toBe('@now/static');
    expect(errors).toBe(null);
  });

  it('no package.json + no build + raw static + api', async () => {
    const files = ['api/users.js', 'index.html'];
    const { builders, errors } = await detectBuilders(files);
    expect(builders![0].use).toBe('@now/node');
    expect(builders![0].src).toBe('api/users.js');
    expect(builders![1].use).toBe('@now/static');
    expect(builders![1].src).toBe('!{api/**,package.json}');
    expect(builders!.length).toBe(2);
    expect(errors).toBe(null);
  });

  it('package.json + no build + root + api', async () => {
    const files = ['index.html', 'api/[endpoint].js', 'static/image.png'];
    const { builders, errors } = await detectBuilders(files);
    expect(builders![0].use).toBe('@now/node');
    expect(builders![0].src).toBe('api/[endpoint].js');
    expect(builders![1].use).toBe('@now/static');
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
    expect(builders![0].use).toBe('@now/node');
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
    expect(builders![0].use).toBe('@now/node');
    expect(builders![0].src).toBe('api/endpoint.js');
    expect(builders![1].use).toBe('@now/next');
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
    expect(builders![0].use).toBe('@now/node');
    expect(builders![0].src).toBe('api/endpoint.js');
    expect(builders![1].use).toBe('@now/next');
    expect(builders![1].src).toBe('package.json');
    expect(builders!.length).toBe(2);
  });

  it('api + raw static', async () => {
    const files = ['api/endpoint.js', 'index.html', 'favicon.ico'];

    const { builders } = await detectBuilders(files);
    expect(builders![0].use).toBe('@now/node');
    expect(builders![0].src).toBe('api/endpoint.js');
    expect(builders![1].use).toBe('@now/static');
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
    expect(builders![0].use).toBe('@now/node');
    expect(builders![0].src).toBe('api/endpoint.js');
    expect(builders![1].use).toBe('@now/static');
    expect(builders![1].src).toBe('public/**/*');
    expect(builders!.length).toBe(2);
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
    expect(builders![0].use).toBe('@now/next');
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
    expect(builders![0].use).toBe('@now/static-build');
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
    expect(builders![0].use).toBe('@now/static-build@canary');
    expect(builders![0].src).toBe('package.json');
    expect(builders!.length).toBe(1);
  });

  it('package.json with no build + api', async () => {
    const pkg = { dependencies: { next: '9.0.0' } };
    const files = ['package.json', 'api/[endpoint].js'];

    const { builders } = await detectBuilders(files, pkg);
    expect(builders![0].use).toBe('@now/node');
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
    expect(builders![0].use).toBe('@now/node@canary');
    expect(builders![1].use).toBe('@now/node@canary');
    expect(builders![2].use).toBe('@now/next@canary');
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
    expect(builders![0].use).toBe('@now/node@latest');
    expect(builders![1].use).toBe('@now/node@latest');
    expect(builders![2].use).toBe('@now/next@latest');
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
    expect(builders![0].use).toBe('@now/node@haha');
    expect(builders![1].use).toBe('@now/node@haha');
    expect(builders![2].use).toBe('@now/next@haha');
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
    expect(builders![0].use).toBe('@now/node');
    expect(builders![1].use).toBe('@now/next');
  });

  it('many static files + one api file', async () => {
    const files = Array.from({ length: 5000 }).map((_, i) => `file${i}.html`);
    files.push('api/index.ts');
    const { builders } = await detectBuilders(files);

    expect(builders!.length).toBe(2);
    expect(builders![0].use).toBe('@now/node');
    expect(builders![0].src).toBe('api/index.ts');
    expect(builders![1].use).toBe('@now/static');
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
      use: '@now/next',
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
      use: '@now/node',
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
      use: '@now/next',
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
    const functions = { 'api/user.php': { runtime: 'now-php@0.0.8' } };
    const files = ['api/user.php'];
    const { builders, errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(errors).toBe(null);
    expect(builders!.length).toBe(1);
    expect(builders![0].use).toBe('now-php@0.0.8');
  });

  it('use a custom runtime but without a source', async () => {
    const functions = { 'api/user.php': { runtime: 'now-php@0.0.8' } };
    const files = ['api/team.js'];
    const { errors } = await detectBuilders(files, null, {
      functions,
    });

    expect(errors!.length).toBe(1);
    expect(errors![0].code).toBe('invalid_function_source');
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
      functions,
    });

    expect(errors!.length).toBe(1);
    expect(errors![0].code).toBe('invalid_function');
  });

  it('Do not allow functions that are not used by @now/next', async () => {
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
    expect(builders![0].use).toBe('@now/node');
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
    expect(builders![0].use).toBe('@now/node');
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
    expect(builders![0].use).toBe('@now/node');
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

    const { builders } = await detectBuilders(files, null, { projectSettings });

    expect(builders!.length).toBe(1);
    expect(builders![0].src).toBe('dist/**/*');
    expect(builders![0].use).toBe('@now/static');

    const { defaultRoutes } = await detectRoutes(files, builders!);

    expect(defaultRoutes!.length).toBe(1);
    expect((defaultRoutes![0] as any).src).toBe('/(.*)');
    expect((defaultRoutes![0] as any).dest).toBe('/dist/$1');
  });

  it('Custom static output directory with api', async () => {
    const projectSettings = {
      outputDirectory: 'output',
    };

    const files = ['api/user.ts', 'output/index.html', 'output/style.css'];

    const { builders } = await detectBuilders(files, null, { projectSettings });

    expect(builders!.length).toBe(2);
    expect(builders![1].src).toBe('output/**/*');
    expect(builders![1].use).toBe('@now/static');

    const { defaultRoutes } = await detectRoutes(files, builders!);

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
        use: '@now/static-build',
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
        use: '@now/static-build',
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
        use: '@now/ruby',
        src: 'api/date.rb',
        config: {
          zeroConfig: true,
        },
      },
      {
        use: '@now/static-build',
        src: 'config.rb',
        config: {
          zeroConfig: true,
          framework: 'middleman',
        },
      },
    ]);
  });
});

it('Test `detectRoutes`', async () => {
  {
    const files = ['api/user.go', 'api/team.js', 'api/package.json'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(files, builders!);
    expect(defaultRoutes!.length).toBe(3);
    expect((defaultRoutes![0] as any).dest).toBe('/api/team.js');
    expect((defaultRoutes![1] as any).dest).toBe('/api/user.go');
    expect((defaultRoutes![2] as any).dest).not.toBeDefined();
    expect((defaultRoutes![2] as any).status).toBe(404);
  }

  {
    const files = ['api/user.go', 'api/user.js'];

    const { builders } = await detectBuilders(files);
    const { error } = await detectRoutes(files, builders!);
    expect(error!.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[user].go', 'api/[team]/[id].js'];

    const { builders } = await detectBuilders(files);
    const { error } = await detectRoutes(files, builders!);
    expect(error!.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[team]/[team].js'];

    const { builders } = await detectBuilders(files);
    const { error } = await detectRoutes(files, builders!);
    expect(error!.code).toBe('conflicting_path_segment');
  }

  {
    const files = ['api/date/index.js', 'api/date/index.go'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes, error } = await detectRoutes(files, builders!);
    expect(defaultRoutes).toBe(null);
    expect(error!.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[endpoint].js', 'api/[endpoint]/[id].js'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(files, builders!);
    expect(defaultRoutes!.length).toBe(3);
  }

  {
    const files = [
      'public/index.html',
      'api/[endpoint].js',
      'api/[endpoint]/[id].js',
    ];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(files, builders!);
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

    const { builders } = await detectBuilders(files, pkg);
    const { defaultRoutes } = await detectRoutes(files, builders!);
    expect((defaultRoutes![1] as any).status).toBe(404);
    expect((defaultRoutes![1] as any).src).toBe('^/api(/.*)?$');
    expect(defaultRoutes!.length).toBe(2);
  }

  {
    const files = ['public/index.html'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(files, builders!);

    expect(defaultRoutes!.length).toBe(1);
  }

  {
    const files = ['api/date/index.js', 'api/date.js'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(files, builders!);

    expect(defaultRoutes!.length).toBe(3);
    expect((defaultRoutes![0] as any).src).toBe(
      '^/api/date(\\/|\\/index|\\/index\\.js)?$'
    );
    expect((defaultRoutes![0] as any).dest).toBe('/api/date/index.js');
    expect((defaultRoutes![1] as any).src).toBe(
      '^/api/(date\\/|date|date\\.js)$'
    );
    expect((defaultRoutes![1] as any).dest).toBe('/api/date.js');
  }

  {
    const files = ['api/date.js', 'api/[date]/index.js'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(files, builders!);

    expect(defaultRoutes!.length).toBe(3);
    expect((defaultRoutes![0] as any).src).toBe(
      '^/api/([^/]+)(\\/|\\/index|\\/index\\.js)?$'
    );
    expect((defaultRoutes![0] as any).dest).toBe(
      '/api/[date]/index.js?date=$1'
    );
    expect((defaultRoutes![1] as any).src).toBe(
      '^/api/(date\\/|date|date\\.js)$'
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
    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(files, builders!);

    expect(builders!.length).toBe(4);
    expect(builders![0].use).toBe('@now/node');
    expect(builders![1].use).toBe('@now/node');
    expect(builders![2].use).toBe('@now/node');
    expect(builders![3].use).toBe('@now/node');
    expect(defaultRoutes!.length).toBe(5);
  }

  {
    // use a custom runtime
    const functions = { 'api/user.php': { runtime: 'now-php@0.0.8' } };
    const files = ['api/user.php'];

    const { builders } = await detectBuilders(files, null, { functions });
    const { defaultRoutes } = await detectRoutes(files, builders!);

    expect(defaultRoutes!.length).toBe(2);
    expect((defaultRoutes![0] as any).dest).toBe('/api/user.php');
  }
});

it('Test `detectRoutes` with `featHandleMiss=true`', async () => {
  const featHandleMiss = true;

  {
    const files = ['api/user.go', 'api/team.js', 'api/package.json'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss
    );
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        src: '^/api/(.+)(?:\\.(?:js|go))$',
        dest: '/api/$1',
        check: true,
      },
      {
        status: 404,
        src: '^/api(/.*)?$',
        continue: true,
      },
    ]);
  }

  {
    const files = ['api/user.go', 'api/user.js'];

    const { builders } = await detectBuilders(files);
    const { error } = await detectRoutes(files, builders!, featHandleMiss);
    expect(error!.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[user].go', 'api/[team]/[id].js'];

    const { builders } = await detectBuilders(files);
    const { error } = await detectRoutes(files, builders!, featHandleMiss);
    expect(error!.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[team]/[team].js'];

    const { builders } = await detectBuilders(files);
    const { error } = await detectRoutes(files, builders!, featHandleMiss);
    expect(error!.code).toBe('conflicting_path_segment');
  }

  {
    const files = ['api/date/index.js', 'api/date/index.go'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes, error } = await detectRoutes(
      files,
      builders!,
      featHandleMiss
    );
    expect(defaultRoutes).toBe(null);
    expect(error!.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[endpoint].js', 'api/[endpoint]/[id].js'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss
    );
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        src: '^/api/(.+)(?:\\.(?:js))$',
        dest: '/api/$1',
        check: true,
      },
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
        continue: true,
      },
    ]);
  }

  {
    const files = [
      'public/index.html',
      'api/[endpoint].js',
      'api/[endpoint]/[id].js',
    ];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss
    );
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        src: '^/api/(.+)(?:\\.(?:js))$',
        dest: '/api/$1',
        check: true,
      },
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
        continue: true,
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

    const { builders } = await detectBuilders(files, pkg);
    const { defaultRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss
    );
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        src: '^/api/(.+)(?:\\.(?:js))$',
        dest: '/api/$1',
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
        continue: true,
      },
    ]);
  }

  {
    const files = ['public/index.html'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss
    );
    expect(defaultRoutes).toStrictEqual([]);
  }

  {
    const files = ['api/date/index.js', 'api/date.js'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss
    );
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        src: '^/api/(.+)(?:\\.(?:js))$',
        dest: '/api/$1',
        check: true,
      },
      {
        status: 404,
        src: '^/api(/.*)?$',
        continue: true,
      },
    ]);
  }

  {
    const files = ['api/date.js', 'api/[date]/index.js'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss
    );
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        src: '^/api/(.+)(?:\\.(?:js))$',
        dest: '/api/$1',
        check: true,
      },
      {
        src: '^/api/([^/]+)(\\/|\\/index|\\/index\\.js)?$',
        dest: '/api/[date]/index?date=$1',
        check: true,
      },
      {
        status: 404,
        src: '^/api(/.*)?$',
        continue: true,
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
    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss
    );

    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        src: '^/api/(.+)(?:\\.(?:ts))$',
        dest: '/api/$1',
        check: true,
      },
      { status: 404, src: '^/api(/.*)?$', continue: true },
    ]);
  }

  {
    // use a custom runtime
    const functions = { 'api/user.php': { runtime: 'now-php@0.0.8' } };
    const files = ['api/user.php'];

    const { builders } = await detectBuilders(files, null, { functions });
    const { defaultRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss
    );
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        src: '^/api/(.+)(?:\\.(?:php))$',
        dest: '/api/$1',
        check: true,
      },
      { status: 404, src: '^/api(/.*)?$', continue: true },
    ]);
  }
});

it('Test `detectRoutes` with `featHandleMiss=true`, `cleanUrls=true`', async () => {
  const featHandleMiss = true;
  const cleanUrls = true;
  const testHeaders = (redirectRoutes: Route[] | null) => {
    if (!redirectRoutes || redirectRoutes.length === 0) {
      throw new Error('Expected one redirect but found none');
    }
    expect(redirectRoutes).toBeDefined();
    expect(redirectRoutes.length).toBe(2);
  };

  {
    const files = ['api/user.go', 'api/team.js', 'api/package.json'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes, redirectRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss,
      cleanUrls
    );
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        status: 404,
        src: '^/api(/.*)?$',
        continue: true,
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

    const { builders } = await detectBuilders(files);
    const { error } = await detectRoutes(
      files,
      builders!,
      featHandleMiss,
      cleanUrls
    );
    expect(error!.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[user].go', 'api/[team]/[id].js'];

    const { builders } = await detectBuilders(files);
    const { error } = await detectRoutes(
      files,
      builders!,
      featHandleMiss,
      cleanUrls
    );
    expect(error!.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[team]/[team].js'];

    const { builders } = await detectBuilders(files);
    const { error } = await detectRoutes(
      files,
      builders!,
      featHandleMiss,
      cleanUrls
    );
    expect(error!.code).toBe('conflicting_path_segment');
  }

  {
    const files = ['api/date/index.js', 'api/date/index.go'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes, error } = await detectRoutes(
      files,
      builders!,
      featHandleMiss,
      cleanUrls
    );
    expect(defaultRoutes).toBe(null);
    expect(error!.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[endpoint].js', 'api/[endpoint]/[id].js'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes, redirectRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss,
      cleanUrls
    );
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
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
        continue: true,
      },
    ]);
  }

  {
    const files = [
      'public/index.html',
      'api/[endpoint].js',
      'api/[endpoint]/[id].js',
    ];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes, redirectRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss,
      cleanUrls
    );
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
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
        continue: true,
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

    const { builders } = await detectBuilders(files, pkg);
    const { defaultRoutes, redirectRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss,
      cleanUrls
    );
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        src: '^/api/([^/]+)$',
        dest: '/api/[endpoint]?endpoint=$1',
        check: true,
      },
      {
        status: 404,
        src: '^/api(/.*)?$',
        continue: true,
      },
    ]);
  }

  {
    const files = ['public/index.html'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss,
      cleanUrls
    );
    expect(defaultRoutes).toStrictEqual([]);
  }

  {
    const files = ['api/date/index.js', 'api/date.js'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes, redirectRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss,
      cleanUrls
    );
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        status: 404,
        src: '^/api(/.*)?$',
        continue: true,
      },
    ]);
  }

  {
    const files = ['api/date.js', 'api/[date]/index.js'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes, redirectRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss,
      cleanUrls
    );
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        src: '^/api/([^/]+)(\\/|\\/index)?$',
        dest: '/api/[date]/index?date=$1',
        check: true,
      },
      {
        status: 404,
        src: '^/api(/.*)?$',
        continue: true,
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
    const { builders } = await detectBuilders(files);
    const { defaultRoutes, redirectRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss,
      cleanUrls
    );
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      { status: 404, src: '^/api(/.*)?$', continue: true },
    ]);
  }

  {
    // use a custom runtime
    const functions = { 'api/user.php': { runtime: 'now-php@0.0.8' } };
    const files = ['api/user.php'];

    const { builders } = await detectBuilders(files, null, { functions });
    const { defaultRoutes, redirectRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss,
      cleanUrls
    );
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      { status: 404, src: '^/api(/.*)?$', continue: true },
    ]);
  }
});

it('Test `detectRoutes` with `featHandleMiss=true`, `cleanUrls=true`, `trailingSlash=true`', async () => {
  const featHandleMiss = true;
  const cleanUrls = true;
  const trailingSlash = true;
  const testHeaders = (redirectRoutes: Route[] | null) => {
    if (!redirectRoutes || redirectRoutes.length === 0) {
      throw new Error('Expected one redirect but found none');
    }
    expect(redirectRoutes).toBeDefined();
    expect(redirectRoutes.length).toBe(2);
  };

  {
    const files = ['api/user.go', 'api/team.js', 'api/package.json'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes, redirectRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss,
      cleanUrls,
      trailingSlash
    );
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        status: 404,
        src: '^/api(/.*)?$',
        continue: true,
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

    const { builders } = await detectBuilders(files);
    const { defaultRoutes, redirectRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss,
      cleanUrls,
      trailingSlash
    );
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
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
        continue: true,
      },
    ]);
  }

  {
    const files = [
      'public/index.html',
      'api/[endpoint].js',
      'api/[endpoint]/[id].js',
    ];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes, redirectRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss,
      cleanUrls,
      trailingSlash
    );
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
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
        continue: true,
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

    const { builders } = await detectBuilders(files, pkg);
    const { defaultRoutes, redirectRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss,
      cleanUrls,
      trailingSlash
    );
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        src: '^/api/([^/]+)$',
        dest: '/api/[endpoint]?endpoint=$1',
        check: true,
      },
      {
        status: 404,
        src: '^/api(/.*)?$',
        continue: true,
      },
    ]);
  }

  {
    const files = ['api/date/index.js', 'api/date.js'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes, redirectRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss,
      cleanUrls,
      trailingSlash
    );
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        status: 404,
        src: '^/api(/.*)?$',
        continue: true,
      },
    ]);
  }

  {
    const files = ['api/date.js', 'api/[date]/index.js'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes, redirectRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss,
      cleanUrls,
      trailingSlash
    );
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      {
        src: '^/api/([^/]+)(\\/|\\/index)?$',
        dest: '/api/[date]/index?date=$1',
        check: true,
      },
      {
        status: 404,
        src: '^/api(/.*)?$',
        continue: true,
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
    const { builders } = await detectBuilders(files);
    const { defaultRoutes, redirectRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss,
      cleanUrls,
      trailingSlash
    );
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      { status: 404, src: '^/api(/.*)?$', continue: true },
    ]);
  }

  {
    // use a custom runtime
    const functions = { 'api/user.php': { runtime: 'now-php@0.0.8' } };
    const files = ['api/user.php'];

    const { builders } = await detectBuilders(files, null, { functions });
    const { defaultRoutes, redirectRoutes } = await detectRoutes(
      files,
      builders!,
      featHandleMiss,
      cleanUrls,
      trailingSlash
    );
    testHeaders(redirectRoutes);
    expect(defaultRoutes).toStrictEqual([
      { handle: 'miss' },
      { status: 404, src: '^/api(/.*)?$', continue: true },
    ]);
  }
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
