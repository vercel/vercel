import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Shared helper for detecting a desktop app that shares a coding agent's config
 * files and can break when the CLI rewrites them. A missed detection only means
 * no warning, so plain path checks of the standard install locations are enough.
 * Which bundle to look for lives in each agent's own file.
 */
export function isMacAppInstalled(bundleName: string, home: string): boolean {
  if (process.platform !== 'darwin') {
    return false;
  }
  return (
    existsSync(join('/Applications', bundleName)) ||
    existsSync(join(home, 'Applications', bundleName))
  );
}
