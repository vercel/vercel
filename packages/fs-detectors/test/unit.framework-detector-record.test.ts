import frameworkList from '@vercel/frameworks';
import { detectFrameworkRecord } from '../src';
import VirtualFilesystem from './virtual-file-system';

describe('detectFrameworkRecord', () => {
  it('Do not detect anything', async () => {
    const fs = new VirtualFilesystem({
      'README.md': '# hi',
      'api/cheese.js': 'export default (req, res) => res.end("cheese");',
    });

    const framework = await detectFrameworkRecord({ fs, frameworkList });
    expect(framework?.slug).toBe(undefined);
  });

  it('Detects a framework record with a matchPackage detector', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          next: '9.0.0',
        },
      }),
    });

    const frameworkRecord = await detectFrameworkRecord({ fs, frameworkList });
    if (!frameworkRecord) {
      throw new Error(
        '`frameworkRecord` was not detected, expected "nextjs" frameworks object'
      );
    }
    expect(frameworkRecord.slug).toBe('nextjs');
    expect(frameworkRecord.name).toBe('Next.js');
    expect(frameworkRecord.detectedVersion).toBe('9.0.0');
  });

  it('Detects a framework record with a matchPackage detector with slashes', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          '@ionic/angular': '5.0.0',
        },
      }),
    });

    const frameworkRecord = await detectFrameworkRecord({ fs, frameworkList });
    if (!frameworkRecord) {
      throw new Error(
        '`frameworkRecord` was not detected, expected "ionic-angular" frameworks object'
      );
    }
    expect(frameworkRecord.slug).toBe('ionic-angular');
    expect(frameworkRecord.detectedVersion).toBe('5.0.0');
  });

  it('Detect first framework version found', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          'nuxt-edge': '3.0.0',
          nuxt3: '2.0.0',
          nuxt: '1.0.0',
        },
      }),
    });

    const framework = await detectFrameworkRecord({ fs, frameworkList });
    expect(framework?.slug).toBe('nuxtjs');
    expect(framework?.detectedVersion).toBe('1.0.0');
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

    const framework = await detectFrameworkRecord({ fs, frameworkList });
    expect(framework?.slug).toBe('nextjs');
  });

  it('Detect Nuxt.js', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          nuxt: '1.0.0',
        },
      }),
    });

    const framework = await detectFrameworkRecord({ fs, frameworkList });
    expect(framework?.slug).toBe('nuxtjs');
  });

  it('Detect Nuxt.js edge', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          'nuxt-edge': '1.0.0',
        },
      }),
    });

    const framework = await detectFrameworkRecord({ fs, frameworkList });
    expect(framework?.slug).toBe('nuxtjs');
  });

  it('Detect Gatsby', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          gatsby: '1.0.0',
        },
      }),
    });

    const framework = await detectFrameworkRecord({ fs, frameworkList });
    expect(framework?.slug).toBe('gatsby');
  });

  it('Detect Hugo #1', async () => {
    const fs = new VirtualFilesystem({
      'config.yaml': 'baseURL: http://example.org/',
      'content/post.md': '# hello world',
    });

    const framework = await detectFrameworkRecord({ fs, frameworkList });
    expect(framework?.slug).toBe('hugo');
  });

  it('Detect Hugo #2', async () => {
    const fs = new VirtualFilesystem({
      'config.json': '{ "baseURL": "http://example.org/" }',
      'content/post.md': '# hello world',
    });

    const framework = await detectFrameworkRecord({ fs, frameworkList });
    expect(framework?.slug).toBe('hugo');
  });

  it('Detect Hugo #3', async () => {
    const fs = new VirtualFilesystem({
      'config.toml': 'baseURL = "http://example.org/"',
      'content/post.md': '# hello world',
    });

    const framework = await detectFrameworkRecord({ fs, frameworkList });
    expect(framework?.slug).toBe('hugo');
  });

  it('Detect Jekyll', async () => {
    const fs = new VirtualFilesystem({
      '_config.yml': 'config',
    });

    const framework = await detectFrameworkRecord({ fs, frameworkList });
    expect(framework?.slug).toBe('jekyll');
  });

  it('Detect Middleman', async () => {
    const fs = new VirtualFilesystem({
      'config.rb': 'config',
    });

    const framework = await detectFrameworkRecord({ fs, frameworkList });
    expect(framework?.slug).toBe('middleman');
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

    const framework = await detectFrameworkRecord({ fs, frameworkList });
    expect(framework?.slug).toBe('scully');
  });

  it('Detect Zola', async () => {
    const fs = new VirtualFilesystem({
      'config.toml': 'base_url = "/"',
    });

    const framework = await detectFrameworkRecord({ fs, frameworkList });
    expect(framework?.slug).toBe('zola');
  });

  describe('Detect Sanity', () => {
    describe('v2', () => {
      it('detects', async () => {
        const fs = new VirtualFilesystem({
          'sanity.json': '',
          'package.json': JSON.stringify({
            scripts: {
              start: 'sanity start',
              build: 'sanity build',
            },
            dependencies: {
              '@sanity/core': '^2.26',
              '@sanity/default-layout': '^2.26',
              '@sanity/default-login': '^2.26',
              '@sanity/desk-tool': '^2.26',
              '@sanity/vision': '^2.26',
              'prop-types': '^15.7',
              react: '^17.0',
              'react-dom': '^17.0',
              'styled-components': '^5.2',
            },
            devDependencies: {
              '@sanity/cli': '^2.26',
            },
          }),
        });

        const framework = await detectFrameworkRecord({ fs, frameworkList });
        expect(framework?.slug).toBe('sanity');
      });
    });

    describe('v3', () => {
      it('detects', async () => {
        const fs = new VirtualFilesystem({
          'sanity.config.ts': '',
          'package.json': JSON.stringify({
            dependencies: {
              '@sanity/vision': '^3.55.0',
              react: '^18.2.0',
              'react-dom': '^18.2.0',
              'react-icons': '^3.11.0',
              sanity: '^3.55.0',
              'styled-components': '^6.1.8',
            },
            devDependencies: {
              '@sanity/eslint-config-studio': '^4.0.0',
              '@types/react': '^18.0.25',
              eslint: '^8.6.0',
              prettier: '^3.0.2',
              typescript: '^5.1.6',
            },
          }),
        });

        const framework = await detectFrameworkRecord({ fs, frameworkList });
        expect(framework?.slug).toBe('sanity-v3');
      });
    });
  });

  it('Detects Hono', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          hono: 'latest',
        },
        devDependencies: {
          eslint: '^8.6.0',
          prettier: '^3.0.2',
          typescript: '^5.1.6',
        },
      }),
      'index.ts':
        'import { Hono } from "hono";\n\nconst app = new Hono();\n\nexport default app;',
    });

    const framework = await detectFrameworkRecord({ fs, frameworkList });
    expect(framework?.slug).toBe('hono');
  });

  it('Detects h3', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          h3: 'latest',
        },
        devDependencies: {
          eslint: '^8.6.0',
          prettier: '^3.0.2',
          typescript: '^5.1.6',
        },
      }),
      'index.ts':
        'import { H3 } from "h3";\nconst app = new H3();\n app.get("/", () => "Hello World!");\nexport default app;',
    });

    const framework = await detectFrameworkRecord({ fs, frameworkList });
    expect(framework?.slug).toBe('h3');
  });
});
