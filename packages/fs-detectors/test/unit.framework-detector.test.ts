import { join } from 'path';
import { frameworkList } from '@vercel/frameworks';
import workspaceManagers from '../src/workspaces/workspace-managers';
import {
  detectFramework,
  detectFrameworkRecord,
  detectFrameworks,
  LocalFileSystemDetector,
} from '../src';
import VirtualFilesystem from './virtual-file-system';
import { removeSupersededFrameworks } from '../src/detect-framework';

const EXAMPLES_DIR = join(__dirname, '../../../examples');

describe('DetectorFilesystem', () => {
  it('should return the directory contents relative to the cwd', async () => {
    const files = {
      'package.json': '{}',
      'packages/app1/package.json': '{}',
      'packages/app2/package.json': '{}',
    };

    const fs = new VirtualFilesystem(files);
    const hasPathSpy = vi.spyOn(fs, '_hasPath');

    expect(await fs.readdir('/', { potentialFiles: ['config.rb'] })).toEqual([
      { name: 'package.json', path: 'package.json', type: 'file' },
      { name: 'packages', path: 'packages', type: 'dir' },
    ]);
    expect(await fs.hasPath('package.json')).toBe(true);
    expect(hasPathSpy).not.toHaveBeenCalled();
    expect(await fs.hasPath('config.rb')).toBe(false);
    expect(hasPathSpy).not.toHaveBeenCalled();
    expect(await fs.hasPath('tsconfig.json')).toBe(false);
    expect(hasPathSpy).toHaveBeenCalled();

    expect(await fs.readdir('packages')).toEqual([
      { name: 'app1', path: 'packages/app1', type: 'dir' },
      { name: 'app2', path: 'packages/app2', type: 'dir' },
    ]);

    expect(await fs.readdir('./packages')).toEqual([
      { name: 'app1', path: 'packages/app1', type: 'dir' },
      { name: 'app2', path: 'packages/app2', type: 'dir' },
    ]);

    expect(
      await fs.readdir('packages/app1', { potentialFiles: ['package.json'] })
    ).toEqual([
      {
        name: 'package.json',
        path: 'packages/app1/package.json',
        type: 'file',
      },
    ]);

    hasPathSpy.mock.calls.length = 0;
    expect(await fs.hasPath('packages/app1/package.json')).toBe(true);
    expect(hasPathSpy).not.toHaveBeenCalled();

    expect(
      await fs.readdir('packages/app1', { potentialFiles: ['vercel.json'] })
    ).toEqual([
      {
        name: 'package.json',
        path: 'packages/app1/package.json',
        type: 'file',
      },
    ]);

    hasPathSpy.mock.calls.length = 0;
    expect(await fs.hasPath('packages/app1/vercel.json')).toBe(false);
    expect(hasPathSpy).not.toHaveBeenCalled();
  });

  it('should be able to write files', async () => {
    const files = {};
    const fs = new VirtualFilesystem(files);
    const hasPathSpy = vi.spyOn(fs, '_hasPath');
    const isFileSpy = vi.spyOn(fs, '_isFile');
    const readFileSpy = vi.spyOn(fs, '_readFile');

    await fs.writeFile('file.txt', 'Hello World');

    expect(await fs.readFile('file.txt')).toEqual(Buffer.from('Hello World'));
    expect(await fs.hasPath('file.txt')).toBe(true);
    expect(await fs.isFile('file.txt')).toBe(true);
    // We expect that the fs returned values from it's caches instead of calling the underlying functions
    expect(hasPathSpy).not.toHaveBeenCalled();
    expect(isFileSpy).not.toHaveBeenCalled();
    expect(readFileSpy).not.toHaveBeenCalled();
  });

  it('should ignore nested potential files for caching', async () => {
    const files = {
      'package.json': '{}',
      'packages/app1/package.json': '{}',
    };
    const fs = new VirtualFilesystem(files);
    await fs.readdir('packages', { potentialFiles: ['app1/package.json'] });
    expect(await fs.hasPath('packages/app1/package.json')).toEqual(true);
  });

  it('should be able to change directories', async () => {
    const nextPackageJson = JSON.stringify({
      dependencies: {
        next: '9.0.0',
      },
    });
    const gatsbyPackageJson = JSON.stringify({
      dependencies: {
        gatsby: '1.0.0',
      },
    });

    const files = {
      'package.json': '{}',
      'packages/app1/package.json': nextPackageJson,
      'packages/app2/package.json': gatsbyPackageJson,
    };

    const fs = new VirtualFilesystem(files);
    const packagesFs = fs.chdir('packages');

    expect(await packagesFs.readdir('/')).toEqual([
      { name: 'app1', path: 'app1', type: 'dir' },
      { name: 'app2', path: 'app2', type: 'dir' },
    ]);

    expect(await packagesFs.hasPath('app1')).toBe(true);
    expect(await packagesFs.hasPath('app3')).toBe(false);
    expect(await packagesFs.isFile('app1')).toBe(false);
    expect(await packagesFs.isFile('app2')).toBe(false);
    expect(await packagesFs.isFile('app1/package.json')).toBe(true);
    expect(await packagesFs.isFile('app2/package.json')).toBe(true);
    expect((await packagesFs.readFile('app1/package.json')).toString()).toEqual(
      nextPackageJson
    );
    expect((await packagesFs.readFile('app2/package.json')).toString()).toEqual(
      gatsbyPackageJson
    );

    expect(await detectFramework({ fs: packagesFs, frameworkList })).toBe(null);

    const nextAppFs = packagesFs.chdir('app1');

    expect(await nextAppFs.readdir('/')).toEqual([
      { name: 'package.json', path: 'package.json', type: 'file' },
    ]);

    expect(await (await nextAppFs.readFile('package.json')).toString()).toEqual(
      nextPackageJson
    );

    expect(await detectFramework({ fs: nextAppFs, frameworkList })).toBe(
      'nextjs'
    );

    const gatsbyAppFs = packagesFs.chdir('./app2');

    expect(await gatsbyAppFs.readdir('/')).toEqual([
      { name: 'package.json', path: 'package.json', type: 'file' },
    ]);

    expect((await gatsbyAppFs.readFile('package.json')).toString()).toEqual(
      gatsbyPackageJson
    );

    expect(await detectFramework({ fs: gatsbyAppFs, frameworkList })).toBe(
      'gatsby'
    );
  });
});

describe('removeSupersededFrameworks()', () => {
  it('should remove "vite" when "hydrogen" is present', () => {
    const matches = [
      { slug: 'storybook' },
      { slug: 'vite' },
      { slug: 'hydrogen', supersedes: ['vite'] },
    ];
    removeSupersededFrameworks(matches);
    expect(matches).toEqual([
      { slug: 'storybook' },
      { slug: 'hydrogen', supersedes: ['vite'] },
    ]);
  });

  it('should remove "hydrogen" when "remix" is present', () => {
    const matches = [
      { slug: 'storybook' },
      { slug: 'vite' },
      { slug: 'hydrogen', supersedes: ['vite'] },
      { slug: 'remix', supersedes: ['hydrogen'] },
    ];
    removeSupersededFrameworks(matches);
    expect(matches).toEqual([
      { slug: 'storybook' },
      { slug: 'remix', supersedes: ['hydrogen'] },
    ]);
  });
});

describe('detectFramework()', () => {
  it('Do not detect anything', async () => {
    const fs = new VirtualFilesystem({
      'README.md': '# hi',
      'api/cheese.js': 'export default (req, res) => res.end("cheese");',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe(null);
  });

  it('Detect nx', async () => {
    const fs = new VirtualFilesystem({
      'workspace.json': JSON.stringify({
        projects: { 'app-one': 'apps/app-one' },
      }),
    });

    expect(
      await detectFramework({ fs, frameworkList: workspaceManagers })
    ).toBe('nx');
  });

  it('Do not detect anything', async () => {
    const fs = new VirtualFilesystem({
      'workspace.json': JSON.stringify({ projects: {} }),
    });

    expect(
      await detectFramework({ fs, frameworkList: workspaceManagers })
    ).toBe(null);
  });

  it('Detect Next.js', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          next: '9.0.0',
        },
      }),
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('nextjs');
  });

  it('Detect Factory (Eve) instead of Eve', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          eve: 'latest',
          '@vercel/factory': 'latest',
        },
      }),
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('factory-eve');
  });

  it('Do not detect Factory (Eve) without Eve', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          '@vercel/factory': 'latest',
        },
      }),
    });

    expect(await detectFramework({ fs, frameworkList })).toBe(null);
  });

  it.each([
    'Dockerfile.vercel',
    'Containerfile.vercel',
  ])('Detect container framework via `%s`', async marker => {
    const fs = new VirtualFilesystem({
      [marker]: 'FROM node:20\nCMD ["node", "server.js"]',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('container');
  });

  it.each([
    'Dockerfile.vercel',
    'Containerfile.vercel',
  ])('Prefer the container framework over others when `%s` is present', async marker => {
    // A project may also be a Next.js app, but the explicit container marker
    // is an opt-in to deploy it as a container instead.
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          next: '14.0.0',
        },
      }),
      [marker]: 'FROM node:20\nCMD ["node", "server.js"]',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('container');
  });

  it.each([
    'server.cjs',
    'server.js',
    'server.mjs',
    'server.mts',
    'server.ts',
    'server.cts',
    'src/server.cjs',
    'src/server.js',
    'src/server.mjs',
    'src/server.mts',
    'src/server.ts',
    'src/server.cts',
  ])('Detect Node via `%s`', async entrypoint => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({}),
      [entrypoint]: '// server entrypoint',
    });

    expect(
      await detectFramework({
        fs,
        frameworkList,
      })
    ).toBe('node');
  });

  it.each([
    'server.cjs',
    'server.js',
    'server.mjs',
    'server.mts',
    'server.ts',
    'server.cts',
    'src/server.cjs',
    'src/server.js',
    'src/server.mjs',
    'src/server.mts',
    'src/server.ts',
    'src/server.cts',
  ])('Detect Node via `%s` without a package.json', async entrypoint => {
    const fs = new VirtualFilesystem({
      [entrypoint]: '// server entrypoint',
    });

    expect(
      await detectFramework({
        fs,
        frameworkList,
      })
    ).toBe('node');
  });

  it('Detect frameworks based on ascending order in framework list', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          next: '9.0.0',
          gatsby: '4.18.0',
        },
      }),
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('nextjs');
  });

  it.each([
    'server.cjs',
    'server.js',
    'server.mjs',
    'server.mts',
    'server.ts',
    'server.cts',
    'src/server.cjs',
    'src/server.js',
    'src/server.mjs',
    'src/server.mts',
    'src/server.ts',
    'src/server.cts',
  ])('Detect Bun via `%s` + bun.lock', async entrypoint => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({}),
      'bun.lock': '',
      [entrypoint]: '// server entrypoint',
    });

    expect(
      await detectFramework({
        fs,
        frameworkList,
        useExperimentalFrameworks: true,
      })
    ).toBe('bun');
  });

  it('Bun is not detected without a server entrypoint', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({}),
      'bun.lock': '',
    });

    expect(
      await detectFramework({
        fs,
        frameworkList,
        useExperimentalFrameworks: true,
      })
    ).toBeNull();
  });

  it('Detect Rust via `src/main.rs` without experimental frameworks', async () => {
    const fs = new VirtualFilesystem({
      'Cargo.toml': '[package]\nname = "my-app"\nversion = "0.1.0"\n',
      'src/main.rs': 'fn main() {}',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('rust');
  });

  it('Rust is not detected for a `[[bin]]` target without `src/main.rs`', async () => {
    // `[[bin]]`-only servers set the Rust preset manually.
    const fs = new VirtualFilesystem({
      'Cargo.toml': [
        '[package]',
        'name = "my-app"',
        'version = "0.1.0"',
        '',
        '[[bin]]',
        'name = "server"',
        'path = "src/bin/server.rs"',
      ].join('\n'),
      'src/bin/server.rs': 'fn main() {}',
    });

    expect(await detectFramework({ fs, frameworkList })).toBeNull();
  });

  it('Rust is not detected for `api/**/*.rs` function projects', async () => {
    // api-function projects declare a `[[bin]]` per handler and must stay
    // framework-less so the api runtime builders apply.
    const fs = new VirtualFilesystem({
      'Cargo.toml': [
        '[package]',
        'name = "crate-api-handler"',
        'version = "0.1.0"',
        'edition = "2021"',
        '',
        '[[bin]]',
        'name = "hello"',
        'path = "api/hello.rs"',
        '',
        '[dependencies]',
        'tokio = { version = "1", features = ["macros", "rt-multi-thread"] }',
        'vercel_runtime = "2"',
      ].join('\n'),
      'api/hello.rs': 'fn main() {}',
    });

    expect(await detectFramework({ fs, frameworkList })).toBeNull();
  });

  it('Rust is not detected for a library-only crate', async () => {
    const fs = new VirtualFilesystem({
      'Cargo.toml': '[package]\nname = "my-lib"\nversion = "0.1.0"\n',
      'src/lib.rs': 'pub fn add(a: u32, b: u32) -> u32 { a + b }',
    });

    expect(await detectFramework({ fs, frameworkList })).toBeNull();
  });

  it('Rust is not detected for a commented-out `[[bin]]`', async () => {
    const fs = new VirtualFilesystem({
      'Cargo.toml': [
        '[package]',
        'name = "my-lib"',
        'version = "0.1.0"',
        '',
        '# Declare binaries with a [[bin]] table, e.g.:',
        '# [[bin]]',
        '# name = "server"',
      ].join('\n'),
      'src/lib.rs': 'pub fn add(a: u32, b: u32) -> u32 { a + b }',
    });

    expect(await detectFramework({ fs, frameworkList })).toBeNull();
  });

  it('Axum and Actix Web remain gated behind experimental frameworks', async () => {
    const fs = new VirtualFilesystem({
      'Cargo.toml': [
        '[package]',
        'name = "my-app"',
        'version = "0.1.0"',
        '',
        '[dependencies]',
        'axum = "0.8"',
      ].join('\n'),
      'src/main.rs': 'fn main() {}',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('rust');
    expect(
      await detectFramework({
        fs,
        frameworkList,
        useExperimentalFrameworks: true,
      })
    ).toBe('axum');
  });

  it('Detect Nuxt.js', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          nuxt: '1.0.0',
        },
      }),
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('nuxtjs');
  });

  it('Detect Nuxt.js Edge', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          'nuxt-edge': '1.0.0',
        },
      }),
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('nuxtjs');
  });

  it('Detect Nuxt.js 3', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          nuxt3: '1.0.0',
        },
      }),
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('nuxtjs');
  });

  it('Detect Gatsby', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          gatsby: '1.0.0',
        },
      }),
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('gatsby');
  });

  it('Detect Hugo #1', async () => {
    const fs = new VirtualFilesystem({
      'config.yaml': 'baseURL: http://example.org/',
      'content/post.md': '# hello world',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('hugo');
  });

  it('Detect Hugo #2', async () => {
    const fs = new VirtualFilesystem({
      'config.json': '{ "baseURL": "http://example.org/" }',
      'content/post.md': '# hello world',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('hugo');
  });

  it('Detect Hugo #3', async () => {
    const fs = new VirtualFilesystem({
      'config.toml': 'baseURL = "http://example.org/"',
      'content/post.md': '# hello world',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('hugo');
  });

  it('Detect Jekyll', async () => {
    const fs = new VirtualFilesystem({
      '_config.yml': 'config',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('jekyll');
  });

  it('Detect Middleman', async () => {
    const fs = new VirtualFilesystem({
      'config.rb': 'config',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('middleman');
  });

  it('Detect Scully', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          '@angular/cli': 'latest',
          '@scullyio/init': 'latest',
        },
      }),
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('scully');
  });

  it('Detect Zola', async () => {
    const fs = new VirtualFilesystem({
      'config.toml': 'base_url = "/"',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('zola');
  });

  it('Detect Blitz.js (Legacy)', async () => {
    const fs = new VirtualFilesystem({
      'blitz.config.js': '// some config',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('blitzjs');
  });

  it('Detect FastHTML', async () => {
    const fs = new VirtualFilesystem({
      'requirements.txt':
        'tensorflow==2.3.1\nuvicorn==0.12.2\npython-fasthtml==0.5.1',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('fasthtml');
  });

  it('Detect Ember via `ember-source`', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          'ember-source': 'latest',
        },
      }),
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('ember');
  });

  it('Detect Ember via `ember-cli`', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          'ember-cli': 'latest',
        },
      }),
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('ember');
  });

  it('Detect Brunch via `brunch`', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          brunch: 'latest',
        },
      }),
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('brunch');
  });

  it('Detect Brunch via `brunch-config.js`', async () => {
    const fs = new VirtualFilesystem({
      'brunch-config.js': '// some config',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('brunch');
  });

  it('Detect Hydrogen via `hydrogen.config.js`', async () => {
    const fs = new VirtualFilesystem({
      'hydrogen.config.js': '// some config',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('hydrogen');
  });

  it('Detect Hydrogen via `@shopify/hydrogen`', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          '@shopify/hydrogen': 'latest',
        },
      }),
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('hydrogen');
  });

  it('Detect Storybook via `storybook`', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          storybook: 'latest',
        },
      }),
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('storybook');
  });

  it('Should detect Remix + Vite as `remix`', async () => {
    const fs = new VirtualFilesystem({
      'vite.config.ts': '',
      'package.json': JSON.stringify({
        dependencies: {
          '@remix-run/dev': 'latest',
          vite: 'latest',
        },
      }),
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('remix');
  });

  it('Should detect TanStack Start without `nitro` via `@tanstack/react-start`', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          '@tanstack/router-plugin': 'latest',
          '@tanstack/react-start': 'latest',
          vite: 'latest',
        },
      }),
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('tanstack-start');
  });

  it('Should keep TanStack Router apps as `vite` without Start packages', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          '@tanstack/router-plugin': 'latest',
          vite: 'latest',
        },
      }),
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('vite');
  });

  it('Should detect React Router v7 as `react-router` via `vite.config.ts`', async () => {
    const fs = new VirtualFilesystem({
      'vite.config.ts': 'import { reactRouter } from "@react-router/dev/vite"',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('react-router');
  });

  it('Should detect React Router v7 as `react-router` via `react-router.config.ts`', async () => {
    const fs = new VirtualFilesystem({
      'react-router.config.ts': '',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('react-router');
  });

  it('Should detect Vite + Ionic React as `vite`', async () => {
    const fs = new LocalFileSystemDetector(join(EXAMPLES_DIR, 'ionic-react'));

    expect(await detectFramework({ fs, frameworkList })).toBe('vite');
  });
});

describe.each([
  ['detectFramework', detectFramework, 'ruby', null],
  [
    'detectFrameworks',
    detectFrameworks,
    [expect.objectContaining({ slug: 'ruby' })],
    [],
  ],
  [
    'detectFrameworkRecord',
    detectFrameworkRecord,
    expect.objectContaining({ slug: 'ruby' }),
    null,
  ],
] as const)('%s Ruby detection', (_, detect, matched, unmatched) => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_RUBY', undefined);
    vi.stubEnv('VERCEL_USE_EXPERIMENTAL_FRAMEWORKS', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('detects a Gemfile with config.ru with only the Ruby buildpack flag enabled', async () => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_RUBY', '1');
    const fs = new VirtualFilesystem({ Gemfile: '', 'config.ru': '' });

    expect(await detect({ fs, frameworkList })).toEqual(matched);
  });

  it.each([
    ['a Gemfile alone', { Gemfile: '' }],
    [
      'a Gemfile with api/ functions',
      { Gemfile: '', 'api/hello.rb': 'Handler = Proc.new { |req, res| }\n' },
    ],
    // Rails and Rack both boot from `config.ru` (`rails server` aborts
    // without it), so Rails markers alone must not detect the preset.
    [
      'a Gemfile with Rails markers but no config.ru',
      {
        Gemfile: 'source "https://rubygems.org"\ngem "rails"\n',
        'Gemfile.lock': 'GEM\n  specs:\n    railties (8.1.3.1)\n',
        'bin/rails': '',
        'config/application.rb': '',
      },
    ],
    [
      'a Gemfile with a server gem resolved in Gemfile.lock',
      {
        Gemfile: 'source "https://rubygems.org"\ngem "puma"\n',
        'Gemfile.lock': 'GEM\n  specs:\n    puma (6.4.2)\n    rack (3.0.0)\n',
      },
    ],
  ])('does not detect Ruby from %s, even with buildpacks enabled', async (_, files) => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_RUBY', '1');
    const fs = new VirtualFilesystem(files);

    expect(await detect({ fs, frameworkList })).toEqual(unmatched);
  });

  it.each([
    ['no Ruby files', {}],
    ['config.ru', { 'config.ru': 'run ->(_env) { [200, {}, ["ok"]] }\n' }],
    ['bin/rails', { 'bin/rails': '' }],
    ['config/application.rb', { 'config/application.rb': '' }],
    ['Gemfile.lock', { 'Gemfile.lock': 'GEM\n  specs:\n    puma (6.4.2)\n' }],
    [
      'config.ru and Gemfile.lock',
      {
        'config.ru': 'run ->(_env) { [200, {}, ["ok"]] }\n',
        'Gemfile.lock': 'GEM\n  specs:\n    puma (6.4.2)\n',
      },
    ],
  ])('does not detect Ruby without a Gemfile (%s), even with buildpacks enabled', async (_, files) => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_RUBY', '1');
    const fs = new VirtualFilesystem(files);

    expect(await detect({ fs, frameworkList })).toEqual(unmatched);
  });

  it.each([
    [
      'rails',
      {
        'config.ru':
          'require_relative "config/environment"\nrun Rails.application\n',
        'config/application.rb': '',
        'bin/rails': '',
      },
    ],
    ['sinatra', { 'config.ru': 'require "./app"\nrun Sinatra::Application\n' }],
  ])('detects %s as the same Ruby preset', async (gem, files) => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_RUBY', '1');
    const fs = new VirtualFilesystem({
      Gemfile: `source "https://rubygems.org"\ngem "${gem}"\n`,
      'Gemfile.lock': `GEM\n  specs:\n    ${gem} (1.0.0)\n`,
      ...files,
    });

    expect(await detect({ fs, frameworkList })).toEqual(matched);
  });

  it('keeps legacy Ruby detection behind global experimental visibility', async () => {
    const fs = new VirtualFilesystem({ Gemfile: '', 'config.ru': '' });

    expect(await detect({ fs, frameworkList })).toEqual(unmatched);
    vi.stubEnv('VERCEL_USE_EXPERIMENTAL_FRAMEWORKS', '1');
    expect(await detect({ fs, frameworkList })).toEqual(matched);
    expect(
      await detect({ fs, frameworkList, useExperimentalFrameworks: false })
    ).toEqual(unmatched);
    vi.stubEnv('VERCEL_USE_EXPERIMENTAL_FRAMEWORKS', undefined);
    expect(
      await detect({ fs, frameworkList, useExperimentalFrameworks: true })
    ).toEqual(matched);
  });

  it.each([
    undefined,
    '',
    '0',
    'true',
    'TRUE',
    '01',
  ])('requires Gemfile and config.ru when the Ruby flag is %s', async flag => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_RUBY', flag);
    vi.stubEnv('VERCEL_USE_EXPERIMENTAL_FRAMEWORKS', '1');

    const incompleteProjects: Record<string, string>[] = [
      { Gemfile: '' },
      { 'config.ru': '' },
      {
        Gemfile: '',
        'Gemfile.lock':
          'GEM\n  specs:\n    puma (6.4.2)\n    thin (1.8.2)\n    unicorn (6.1.0)\n    passenger (6.0.20)\n    rack (3.0.0)\n',
      },
    ];
    for (const files of incompleteProjects) {
      const fs = new VirtualFilesystem(files);
      expect(await detect({ fs, frameworkList })).toEqual(unmatched);
    }

    const fs = new VirtualFilesystem({ Gemfile: '', 'config.ru': '' });
    expect(await detect({ fs, frameworkList })).toEqual(matched);
    vi.stubEnv('VERCEL_USE_EXPERIMENTAL_FRAMEWORKS', undefined);
    expect(await detect({ fs, frameworkList })).toEqual(unmatched);
  });

  it('reevaluates the Ruby flag after import and between detection calls', async () => {
    // Without global experimental visibility, only the Ruby flag makes the
    // experimental preset detectable; the detector itself is static.
    vi.stubEnv('VERCEL_USE_EXPERIMENTAL_FRAMEWORKS', undefined);
    const fs = new VirtualFilesystem({ Gemfile: '', 'config.ru': '' });

    for (const flag of [undefined, '1', '0', '1', undefined]) {
      vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_RUBY', flag);
      expect(await detect({ fs, frameworkList })).toEqual(
        flag === '1' ? matched : unmatched
      );
    }
  });
});

describe('Ruby static-site generators with the Ruby buildpack flag enabled', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_RUBY', '1');
    vi.stubEnv('VERCEL_USE_EXPERIMENTAL_FRAMEWORKS', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Jekyll and Middleman sites carry a Gemfile too. They must keep detecting
  // as themselves, and as the *only* match: service detection errors when a
  // workspace matches more than one framework.
  it.each([
    [
      'jekyll',
      {
        Gemfile: 'source "https://rubygems.org"\ngem "jekyll"\n',
        '_config.yml': 'title: Blog\n',
      },
    ],
    [
      'middleman',
      {
        Gemfile: 'source "https://rubygems.org"\ngem "middleman"\n',
        'config.rb': 'activate :directory_indexes\n',
      },
    ],
  ])('detects a %s site as only that framework', async (slug, files) => {
    const fs = new VirtualFilesystem(files);

    expect(await detectFramework({ fs, frameworkList })).toBe(slug);
    expect(await detectFrameworks({ fs, frameworkList })).toEqual([
      expect.objectContaining({ slug }),
    ]);
    expect(await detectFrameworkRecord({ fs, frameworkList })).toEqual(
      expect.objectContaining({ slug })
    );
  });
});

describe('container framework detection priority', () => {
  const nextPackageJson = JSON.stringify({
    dependencies: { next: 'latest' },
  });

  it.each([
    'Dockerfile',
    'Containerfile',
  ])('treats plain %s detection as a fallback', async containerFile => {
    const fs = new VirtualFilesystem({
      'package.json': nextPackageJson,
      [containerFile]: 'FROM node:22',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('nextjs');
    expect(
      (await detectFrameworks({ fs, frameworkList })).map(f => f.slug)
    ).toEqual(['nextjs', 'container']);
    expect(await detectFrameworkRecord({ fs, frameworkList })).toEqual(
      expect.objectContaining({ slug: 'nextjs' })
    );
  });

  it.each([
    'Dockerfile.vercel',
    'Containerfile.vercel',
  ])('keeps %s detection eager', async containerFile => {
    const fs = new VirtualFilesystem({
      'package.json': nextPackageJson,
      [containerFile]: 'FROM node:22',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('container');
    expect(
      (await detectFrameworks({ fs, frameworkList })).map(f => f.slug)
    ).toEqual(['container', 'nextjs']);
    expect(await detectFrameworkRecord({ fs, frameworkList })).toEqual(
      expect.objectContaining({ slug: 'container' })
    );
  });

  it('detects a plain Dockerfile when no other framework matches', async () => {
    const fs = new VirtualFilesystem({ Dockerfile: 'FROM node:22' });

    expect(await detectFramework({ fs, frameworkList })).toBe('container');
    expect(await detectFrameworks({ fs, frameworkList })).toEqual([
      expect.objectContaining({ slug: 'container' }),
    ]);
    expect(await detectFrameworkRecord({ fs, frameworkList })).toEqual(
      expect.objectContaining({ slug: 'container' })
    );
  });

  it('does not let a fallback match supersede an eager match', async () => {
    const fs = new VirtualFilesystem({ eager: '', fallback: '' });
    const frameworks = [
      {
        slug: 'fallback',
        supersedes: ['eager'],
        detectors: { some: [{ path: 'fallback', fallback: true }] },
      },
      {
        slug: 'eager',
        detectors: { some: [{ path: 'eager' }] },
      },
    ];

    expect(await detectFramework({ fs, frameworkList: frameworks })).toBe(
      'eager'
    );
  });
});

describe('detectFrameworks()', () => {
  it('Return empty array when there are no matches', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {},
      }),
    });

    expect(await detectFrameworks({ fs, frameworkList })).toEqual([]);
  });

  it('Should detect `nextjs`', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          next: 'latest',
        },
      }),
    });

    const slugs = (await detectFrameworks({ fs, frameworkList })).map(
      f => f.slug
    );
    expect(slugs).toEqual(['nextjs']);
  });

  it('Should detect `remix`', async () => {
    const fs = new VirtualFilesystem({
      'remix.config.js': '',
    });

    const slugs = (await detectFrameworks({ fs, frameworkList })).map(
      f => f.slug
    );
    expect(slugs).toEqual(['remix']);
  });

  it('Should detect `nextjs` and `storybook`', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          next: 'latest',
          storybook: 'latest',
        },
      }),
    });

    const slugs = (await detectFrameworks({ fs, frameworkList })).map(
      f => f.slug
    );
    expect(slugs).toEqual(['nextjs', 'storybook']);
  });

  it('Should detect Remix + Vite as `remix`', async () => {
    const fs = new VirtualFilesystem({
      'vite.config.ts': '',
      'package.json': JSON.stringify({
        dependencies: {
          '@remix-run/dev': 'latest',
          vite: 'latest',
        },
      }),
    });

    const slugs = (await detectFrameworks({ fs, frameworkList })).map(
      f => f.slug
    );
    expect(slugs).toEqual(['remix']);
  });

  it('Should detect TanStack Start without `nitro` and supersede `vite`', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          '@tanstack/router-plugin': 'latest',
          '@tanstack/react-start': 'latest',
          vite: 'latest',
        },
      }),
    });

    const slugs = (await detectFrameworks({ fs, frameworkList })).map(
      f => f.slug
    );
    expect(slugs).toEqual(['tanstack-start']);
  });

  describe('Hono', () => {
    const importSyntaxes = [
      'import { Hono } from "hono"',
      "import { Hono } from 'hono'",
      'const H = require("hono")',
      'import("hono")',
    ];

    const filePaths = [
      'index.ts',
      'index.js',
      'src/index.ts',
      'src/index.js',
      'server.ts',
      'src/server.ts',
    ];

    // Test each import syntax with each file path
    importSyntaxes.forEach(syntax => {
      filePaths.forEach(filePath => {
        it(`Should detect Hono with syntax "${syntax}" in ${filePath}`, async () => {
          const fs = new VirtualFilesystem({
            'package.json': JSON.stringify({
              dependencies: {
                hono: 'latest',
              },
            }),
            [filePath]: syntax,
          });

          const slugs = (await detectFrameworks({ fs, frameworkList })).map(
            f => f.slug
          );
          expect(slugs).toEqual(['hono']);
        });
      });
    });

    it('Should not detect Hono without the package', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({
          dependencies: {},
        }),
        'index.ts': 'import { Hono } from "hono"',
      });

      const slugs = (await detectFrameworks({ fs, frameworkList })).map(
        f => f.slug
      );
      expect(slugs).toEqual([]);
    });

    // Test false positives - should not detect Hono
    const falsePositiveCases = [
      // Variable names containing "hono"
      'const hono = "something"',
      'let hono = "web framework"',
      'var hono = "framework"',
      'const myHono = "app"',
      'const honoApp = "application"',
      'const appHono = "server"',
    ];

    falsePositiveCases.forEach((code, index) => {
      it(`Should not detect Hono in false positive case ${index + 1}: "${code.substring(0, 50)}..."`, async () => {
        const fs = new VirtualFilesystem({
          'package.json': JSON.stringify({
            dependencies: {},
          }),
          'index.ts': code,
        });

        const slugs = (await detectFrameworks({ fs, frameworkList })).map(
          f => f.slug
        );
        expect(slugs).toEqual([]);
      });
    });
  });

  it('Should detect "hydrogen-2" template as `remix`', async () => {
    const fs = new LocalFileSystemDetector(join(EXAMPLES_DIR, 'hydrogen-2'));

    const slugs = (await detectFrameworks({ fs, frameworkList })).map(
      f => f.slug
    );
    expect(slugs).toEqual(['remix']);
  });

  it('Should detect `blade`', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          blade: 'latest',
        },
      }),
    });

    const slugs = (await detectFrameworks({ fs, frameworkList })).map(
      f => f.slug
    );
    expect(slugs).toEqual(['blade']);
  });
});

describe('Go buildpack framework detection', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    undefined,
    '0',
    '1',
  ])('does not detect a Go module or API-only project as a framework with flag %s', async flag => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_GO', flag);
    for (const files of [{}, { 'api/hello.go': 'package handler\n' }]) {
      const fs = new VirtualFilesystem({
        'go.mod': 'module example.com/app\n\ngo 1.24\n',
        ...files,
      });
      expect(await detectFramework({ fs, frameworkList })).toBeNull();
      expect(await detectFrameworks({ fs, frameworkList })).toEqual([]);
    }
  });

  it('preserves an explicit Dockerfile.vercel override for a Go application', async () => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_GO', '1');
    const fs = new VirtualFilesystem({
      'go.mod': 'module example.com/app\n\ngo 1.24\n',
      'main.go': 'package main\nfunc main() {}\n',
      'Dockerfile.vercel': 'FROM golang:1.24\n',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('container');
  });
});
