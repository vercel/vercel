import { promises } from 'fs';
import path from 'path';

import { DetectorFilesystem } from '../../src';
import { Stat } from '../../src/detectors/filesystem';

const { stat, readFile, readdir } = promises;

export class FixtureFilesystem extends DetectorFilesystem {
  private rootPath: string;

  constructor(fixturePath: string) {
    super();

    this.rootPath = fixturePath;
  }

  async _hasPath(name: string): Promise<boolean> {
    try {
      const filePath = path.join(this.rootPath, name);
      await stat(filePath);

      return true;
    } catch {
      return false;
    }
  }
  async _readFile(name: string): Promise<Buffer> {
    const filePath = path.join(this.rootPath, name);
    return readFile(filePath);
  }
  async _isFile(name: string): Promise<boolean> {
    const filePath = path.join(this.rootPath, name);
    return (await stat(filePath)).isFile();
  }

  async _readdir(name: string): Promise<Stat[]> {
    const dirPath = path.join(this.rootPath, name);
    const files = await readdir(dirPath, { withFileTypes: true });

    return files.map(file => ({
      name: file.name,
      type: file.isFile() ? 'file' : 'dir',
      path: path.join(name, file.name),
    }));
  }

  _chdir(name: string): DetectorFilesystem {
    return new FixtureFilesystem(path.join(this.rootPath, name));
  }
}
