import path from 'path';
import { readFileSync } from 'fs-extra';
import { Framework } from '@vercel/frameworks';
import { detectFramework, DetectorFilesystem } from '../src';

const frameworkList = JSON.parse(
  readFileSync(
    path.join(__dirname, '..', '..', 'frameworks', 'frameworks.json')
  ).toString()
) as Framework[];

class VirtualFilesystem extends DetectorFilesystem {
  private files: Map<string, Buffer>;

  constructor(files: { [key: string]: string | Buffer }) {
    super();
    this.files = new Map();
    Object.entries(files).map(([key, value]) => {
      const buffer = typeof value === 'string' ? Buffer.from(value) : value;
      this.files.set(key, buffer);
    });
  }

  async _hasPath(path: string): Promise<boolean> {
    for (const file of this.files.keys()) {
      if (file.startsWith(path)) {
        return true;
      }
    }

    return false;
  }

  async _isFile(name: string): Promise<boolean> {
    return this.files.has(name);
  }

  async _readFile(name: string): Promise<Buffer> {
    const file = this.files.get(name);

    if (file === undefined) {
      throw new Error('File does not exist');
    }

    if (typeof file === 'string') {
      return Buffer.from(file);
    }

    return file;
  }
}

describe('#detectFramework', () => {
  it('Do not detect anything', async () => {
    const fs = new VirtualFilesystem({
      'README.md': '# hi',
      'api/cheese.js': 'export default (req, res) => res.end("cheese");',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe(null);
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
      'config.yaml': 'config',
      'content/post.md': '# hello world',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('hugo');
  });

  it('Detect Hugo #2', async () => {
    const fs = new VirtualFilesystem({
      'config.json': 'config',
      'content/post.md': '# hello world',
    });

    expect(await detectFramework({ fs, frameworkList })).toBe('hugo');
  });

  it('Detect Hugo #3', async () => {
    const fs = new VirtualFilesystem({
      'config.toml': 'config',
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
});
