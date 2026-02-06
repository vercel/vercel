import fs from 'fs';
import os from 'os';
import path from 'path';
import { VercelOidcTokenError } from './token-error';

export function findRootDir(): string | null {
  try {
    let dir = process.cwd();
    while (dir !== path.dirname(dir)) {
      const pkgPath = path.join(dir, '.vercel');
      if (fs.existsSync(pkgPath)) {
        return dir;
      }
      dir = path.dirname(dir);
    }
  } catch (_e) {
    throw new VercelOidcTokenError(
      'Token refresh only supported in node server environments'
    );
  }
  return null;
}

export function getUserDataDir(): string | null {
  if (process.env.XDG_DATA_HOME) {
    return process.env.XDG_DATA_HOME;
  }
  switch (os.platform()) {
    case 'darwin':
      return path.join(os.homedir(), 'Library/Application Support');
    case 'linux':
      return path.join(os.homedir(), '.local/share');
    case 'win32':
      if (process.env.LOCALAPPDATA) {
        return process.env.LOCALAPPDATA;
      }
      return null;
    default:
      return null;
  }
}
