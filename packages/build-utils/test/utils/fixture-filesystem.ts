import { promises } from 'fs';
import path from 'path';

import { DetectorFilesystem } from '../../src';

const { stat, readFile } = promises;

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
}
