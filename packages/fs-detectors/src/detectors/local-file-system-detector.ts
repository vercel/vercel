import fs from 'node:fs/promises';
import { join, relative } from 'node:path';
import { DetectorFilesystem, DetectorFilesystemStat } from './filesystem.js';
import { isErrnoException } from '@vercel/error-utils';

export class LocalFileSystemDetector extends DetectorFilesystem {
  private rootPath: string;

  constructor(rootPath: string) {
    super();
    this.rootPath = rootPath;
  }

  async _hasPath(name: string): Promise<boolean> {
    try {
      await fs.stat(this.getFilePath(name));
      return true;
    } catch (err) {
      if (isErrnoException(err) && err.code === 'ENOENT') {
        return false;
      }
      throw err;
    }
  }

  _readFile(name: string): Promise<Buffer> {
    return fs.readFile(this.getFilePath(name));
  }

  async _isFile(name: string): Promise<boolean> {
    const stat = await fs.stat(this.getFilePath(name));
    return stat.isFile();
  }

  async _readdir(dir: string): Promise<DetectorFilesystemStat[]> {
    const dirPath = this.getFilePath(dir);
    const files = await fs.readdir(dirPath);
    return Promise.all(
      files.map(async name => {
        const absPath = join(this.rootPath, dir, name);
        const path = join(this.getRelativeFilePath(dir), name);

        const stat = await fs.stat(absPath);
        let type: DetectorFilesystemStat['type'];
        if (stat.isFile()) {
          type = 'file';
        } else if (stat.isDirectory()) {
          type = 'dir';
        } else {
          throw new Error(`Dirent was neither file nor directory: ${path}`);
        }

        return { name, path, type };
      })
    );
  }

  _chdir(name: string): DetectorFilesystem {
    return new LocalFileSystemDetector(this.getFilePath(name));
  }

  private getRelativeFilePath(name: string) {
    return name.startsWith(this.rootPath)
      ? relative(this.rootPath, name)
      : name;
  }

  private getFilePath(name: string) {
    return join(this.rootPath, this.getRelativeFilePath(name));
  }
}
