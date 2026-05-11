import fs from 'node:fs';

export function isDirectory(targetPath: string): boolean {
  try {
    return fs.lstatSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}
