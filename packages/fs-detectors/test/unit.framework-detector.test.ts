import { join } from 'path';
import frameworkList from '@vercel/frameworks';
import workspaceManagers from '../src/workspaces/workspace-managers';
import {
  detectFramework,
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
    const hasPathSpy = jest.spyOn(fs, '_hasPath');

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
    const hasPathSpy = jest.spyOn(fs, '_hasPath');
    const isFileSpy = jest.spyOn(fs, '_isFile');
    const readFileSpy = jest.spyOn(fs, '_readFile');

    await fs.writeFile('file.txt', 'Hello World');

    expect(await fs.readFile('file.txt')).toEqual(Buffer.from('Hello World'));
    expect(await fs.hasPath('file.txt')).toBe(true);
    expect(await fs.isFile('file.txt')).toBe(true);
    // We expect that the fs returned values from it's caches instead of calling the underlying functions
    expect(hasPathSpy).not.toHaveBeenCalled();
    expect(isFileSpy).not.toHaveBeenCalled();
    expect(readFileSpy).not.toHaveBeenCalled();
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
        },
      }),
    });

    const slugs = (await detectFrameworks({ fs, frameworkList })).map(
      f => f.slug
    );
    expect(slugs).toEqual(['remix']);
  });

  it('Should detect "hydrogen" template as `hydrogen`', async () => {
    const fs = new LocalFileSystemDetector(join(EXAMPLES_DIR, 'hydrogen'));

    const slugs = (await detectFrameworks({ fs, frameworkList })).map(
      f => f.slug
    );
    expect(slugs).toEqual(['hydrogen']);
  });

  it('Should detect "hydrogen-2" template as `remix`', async () => {
    const fs = new LocalFileSystemDetector(join(EXAMPLES_DIR, 'hydrogen-2'));

    const slugs = (await detectFrameworks({ fs, frameworkList })).map(
      f => f.slug
    );
    expect(slugs).toEqual(['remix']);
  });
});
