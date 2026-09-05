import { join } from 'path';
import { readFile, writeFile } from 'fs-extra';
import { VERCEL_DIR } from './projects/link';
import getDominantEOL from './get-dominant-eol';

export async function addToGitIgnore(path: string, ignore = VERCEL_DIR) {
  let isGitIgnoreUpdated = false;
  try {
    const gitIgnorePath = join(path, '.gitignore');

    let gitIgnore: string =
      (await readFile(gitIgnorePath, 'utf8').catch(() => null)) ?? '';

    if (gitIgnore.includes(ignore)) return isGitIgnoreUpdated;

    const EOL = getDominantEOL(gitIgnore);

    gitIgnore = gitIgnore.concat(
      gitIgnore.endsWith('\n') || gitIgnore.length === 0 ? '' : EOL,
      ignore,
      EOL
    );

    await writeFile(gitIgnorePath, gitIgnore);
    isGitIgnoreUpdated = true;
  } catch (error) {
    // ignore errors since this is non-critical
  }
  return isGitIgnoreUpdated;
}
