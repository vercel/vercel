import monorepoList from '@vercel/monorepos';
import { detectMonorepo, DetectorFilesystem } from '../src';

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

describe('#detectMonorepo', () => {
  it('Do not detect anything', async () => {
    const fs = new VirtualFilesystem({
      'README.md': '# hi',
      'api/cheese.js': 'export default (req, res) => res.end("cheese");',
    });

    expect(await detectMonorepo({ fs, monorepoList })).toBe(null);
  });

  it('Detect Next.js', async () => {
    const fs = new VirtualFilesystem({
      'turbo.json': JSON.stringify({
        dependencies: {
          turbo: 'latest',
        },
      }),
    });

    expect(await detectMonorepo({ fs, monorepoList })).toBe('turbo');
  });
});
