import { copyFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import getGlobalPathConfig from './config/global-path';
import pkg from './pkg';

/** `~/.vercel/runtime/<cli-version>` — on-disk assets for child Node processes. */
export function getRuntimeAssetsDir(
  version: string = pkg.version,
  globalRoot: string = getGlobalPathConfig()
): string {
  return join(globalRoot, 'runtime', version);
}

/**
 * Copy `sourcePath` into `~/.vercel/runtime/<version>/` and return that path.
 * Overwrites any existing file so same-version rebuilds stay current.
 */
export function ensureRuntimeAssetOnDisk(
  sourcePath: string,
  options: {
    globalRoot?: string;
    version?: string;
  } = {}
): string {
  const destDir = getRuntimeAssetsDir(
    options.version ?? pkg.version,
    options.globalRoot ?? getGlobalPathConfig()
  );
  const destPath = join(destDir, basename(sourcePath));

  mkdirSync(destDir, { recursive: true });
  copyFileSync(sourcePath, destPath);

  return destPath;
}
