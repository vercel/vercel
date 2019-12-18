import _FrameworkList from '../../frameworks/frameworks.json';
import {
  detectFramework,
  DetectorFilesystem,
  FrameworkDetectionItem,
} from '../src';

const frameworkList = _FrameworkList as FrameworkDetectionItem[];

class VirtualFilesystem extends DetectorFilesystem {
  private files: { [key: string]: string | Buffer };

  constructor(files: { [key: string]: string | Buffer }) {
    super();
    this.files = files;
  }

  async _exists(name: string) {
    return this.files[name];
  }

  async _readFile(name: string) {
    const file = this.files[name];

    if (typeof file === 'string') {
      return Buffer.from(file);
    }

    return file;
  }
}

describe('#detectFramework', () => {
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
});
