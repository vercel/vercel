import path from 'path';
import { DetectorFilesystem } from '../src';
import { DetectorFilesystemStat } from '../src/detectors/filesystem';

const posixPath = path.posix;

export default class VirtualFilesystem extends DetectorFilesystem {
  private files: Map<string, Buffer>;
  private cwd: string;

  constructor(files: { [key: string]: string | Buffer }, cwd = '') {
    super();
    this.files = new Map();
    this.cwd = cwd;
    Object.entries(files).map(([key, value]) => {
      const buffer = typeof value === 'string' ? Buffer.from(value) : value;
      this.files.set(key, buffer);
    });
  }

  private _normalizePath(rawPath: string): string {
    return posixPath.normalize(rawPath);
  }

  async _hasPath(name: string): Promise<boolean> {
    const basePath = this._normalizePath(posixPath.join(this.cwd, name));
    for (const file of this.files.keys()) {
      if (file.startsWith(basePath)) {
        return true;
      }
    }

    return false;
  }

  async _isFile(name: string): Promise<boolean> {
    const basePath = this._normalizePath(posixPath.join(this.cwd, name));
    return this.files.has(basePath);
  }

  async _readFile(name: string): Promise<Buffer> {
    const basePath = this._normalizePath(posixPath.join(this.cwd, name));
    const file = this.files.get(basePath);

    if (file === undefined) {
      throw new Error('File does not exist');
    }

    if (typeof file === 'string') {
      return Buffer.from(file);
    }

    return file;
  }

  /**
   * An example of how to implement readdir for a virtual filesystem.
   */
  async _readdir(name = '/'): Promise<DetectorFilesystemStat[]> {
    return (
      [...this.files.keys()]
        .map(filepath => {
          const basePath = this._normalizePath(
            posixPath.join(this.cwd, name === '/' ? '' : name)
          );
          const fileDirectoryName = posixPath.dirname(filepath);

          if (fileDirectoryName === basePath) {
            return {
              name: posixPath.basename(filepath),
              path: filepath.replace(
                this.cwd === '' ? this.cwd : `${this.cwd}/`,
                ''
              ),
              type: 'file',
            };
          }

          if (
            (basePath === '.' && fileDirectoryName !== '.') ||
            fileDirectoryName.startsWith(basePath)
          ) {
            let subDirectoryName = fileDirectoryName.replace(
              basePath === '.' ? '' : `${basePath}/`,
              ''
            );

            if (subDirectoryName.includes('/')) {
              subDirectoryName = subDirectoryName.split('/')[0];
            }

            return {
              name: subDirectoryName,
              path:
                name === '/'
                  ? subDirectoryName
                  : this._normalizePath(posixPath.join(name, subDirectoryName)),
              type: 'dir',
            };
          }

          return null;
        })
        // remove nulls
        .filter((stat): stat is DetectorFilesystemStat => stat !== null)
        // remove duplicates
        .filter(
          (stat, index, self) =>
            index ===
            self.findIndex(s => s.name === stat.name && s.path === stat.path)
        )
    );
  }

  /**
   * An example of how to implement chdir for a virtual filesystem.
   */
  _chdir(name: string): DetectorFilesystem {
    const basePath = this._normalizePath(posixPath.join(this.cwd, name));
    const files = Object.fromEntries(
      [...this.files.keys()].map(key => [key, this.files.get(key) ?? ''])
    );

    return new VirtualFilesystem(files, basePath);
  }
}
