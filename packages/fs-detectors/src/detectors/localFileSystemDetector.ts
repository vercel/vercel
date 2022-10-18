import fs from 'fs/promises';
import type { Dirent } from 'fs';
import path from 'path';
import { DetectorFilesystem, DetectorFilesystemStat } from './filesystem';
import { isErrnoException } from '../isError';

export class LocalFileSystemDetector extends DetectorFilesystem {
  private rootPath: string;
  constructor(rootPath: string) {
    super();
    this.rootPath = rootPath;
  }
  protected async _hasPath(name: string): Promise<boolean> {
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
  protected _readFile(name: string): Promise<Buffer> {
    return fs.readFile(this.getFilePath(name));
  }
  protected async _isFile(name: string): Promise<boolean> {
    const stat = await fs.stat(this.getFilePath(name));
    return stat.isFile();
  }
  protected async _readdir(name: string): Promise<DetectorFilesystemStat[]> {
    const dir = await fs.readdir(this.getFilePath(name), {
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
      path: this.getFilePath(dirent.name),
      type: getType(dirent),
    }));
  }
  protected _chdir(name: string): DetectorFilesystem {
    return new LocalFileSystemDetector(this.getFilePath(name));
  }
  private getFilePath(name: string) {
    return path.join(this.rootPath, name);
  }
}
