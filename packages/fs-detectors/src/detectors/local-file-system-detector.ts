import fs from 'fs/promises';
import { join, relative } from 'path';
import { DetectorFilesystem, DetectorFilesystemStat } from './filesystem';
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
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const result = [] as DetectorFilesystemStat[];
    for (const entry of entries) {
      let type: DetectorFilesystemStat['type'];
      if (entry.isFile()) {
        type = 'file';
      } else if (entry.isDirectory()) {
        type = 'dir';
      } else {
        // ignore socket, fifo, block device, and character device
        continue;
      }

      result.push({
        name: entry.name,
        path: join(this.getRelativeFilePath(dir), entry.name),
        type,
      });
    }
    return result;
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
