import fs, { ensureDirSync } from 'fs-extra';
import path from 'path';
import XDGAppPaths from 'xdg-app-paths';
import { getCachedTmpDir } from './get-tmp-dir';

export default function getGlobalDir() {
  let globalDir: string;

  if (process.env.CI) {
    globalDir = XDGAppPaths('com.vercel.cli').dataDirs()[0];
  } else {
    globalDir = path.join(getCachedTmpDir(), 'com.vercel.tests');
  }

  if (!fs.existsSync(globalDir)) {
    ensureDirSync(globalDir);
  }

  return globalDir;
}
