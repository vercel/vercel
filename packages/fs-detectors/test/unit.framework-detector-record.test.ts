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
});
