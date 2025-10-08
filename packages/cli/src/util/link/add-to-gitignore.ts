import os from 'os';
import { join } from 'path';
import { readFile, writeFile } from 'fs-extra';
import { VERCEL_DIR } from '../projects/link';

export async function addToGitIgnore(path: string, ignore = VERCEL_DIR) {
  let isGitIgnoreUpdated = false;
  try {
    const gitIgnorePath = join(path, '.gitignore');

    let gitIgnore =
      (await readFile(gitIgnorePath, 'utf8').catch(() => null)) ?? '';
    const EOL = gitIgnore.includes('\r\n') ? '\r\n' : os.EOL;
    let contentModified = false;

    if (!gitIgnore.split(EOL).includes(ignore)) {
      gitIgnore += `${
        gitIgnore.endsWith(EOL) || gitIgnore.length === 0 ? '' : EOL
      }${ignore}${EOL}`;
      contentModified = true;
    }

    if (contentModified) {
      await writeFile(gitIgnorePath, gitIgnore);
      isGitIgnoreUpdated = true;
    }
  } catch (error) {
    // ignore errors since this is non-critical
  }
  return isGitIgnoreUpdated;
}
