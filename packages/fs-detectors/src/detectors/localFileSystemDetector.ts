import fs from 'fs/promises';
import type { Dirent } from 'fs';
import path from 'path';
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
  async _readdir(name: string): Promise<DetectorFilesystemStat[]> {
    const dirPath = this.getFilePath(name);
    const dir = await fs.readdir(dirPath, {
      withFileTypes: true,
    });
    const getType = (dirent: Dirent) => {
      if (dirent.isFile()) {
        return 'file';
      } else if (dirent.isDirectory()) {
        return 'dir';
      } else {
        throw new Error(`Dirent was neither file nor directory`);
      }
    };
    return dir.map(dirent => ({
      name: dirent.name,
      path: path.join(dirPath, dirent.name),
      type: getType(dirent),
    }));
  }
  _chdir(name: string): DetectorFilesystem {
    return new LocalFileSystemDetector(this.getFilePath(name));
  }
  private getFilePath(name: string) {
    return path.join(this.rootPath, name);
  }
}
