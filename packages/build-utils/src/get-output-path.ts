import path from 'path';
import { isDirectoryPath } from './fs/is-directory-path';

// This may end up being the output folder if it is indeed a prebuilt build
export const PREBUILT_OUTPUT_DIR = '.vercel/output';

const outputDirPrefix = process.env.HOME || '';
if (!outputDirPrefix) {
  throw new Error('Expected `HOME` environment variable to be set');
}

// This core logic was ported from vc-build/build.ts
export async function getOutputPath(
  workPath: string,
  rootPath: string
): Promise<string> {
  let cwd = workPath;
  let outputDir: string;
  let isPrebuilt = await isDirectoryPath(path.join(cwd, PREBUILT_OUTPUT_DIR));

  if (!isPrebuilt && rootPath && rootPath !== workPath) {
    cwd = rootPath;
    isPrebuilt = await isDirectoryPath(path.join(cwd, PREBUILT_OUTPUT_DIR));
  }

  if (isPrebuilt) {
    // This ends up something like `/vercel/path0/.vercel/output` (TODO: verify)
    outputDir = path.join(cwd, PREBUILT_OUTPUT_DIR);
  } else {
    // The Build Output API contents will be located at `$HOME/output`.
    // Note, this currently ends up being `/vercel/output`
    outputDir = path.join(outputDirPrefix, 'output');
  }

  return outputDir;
}
