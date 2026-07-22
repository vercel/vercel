import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import output from '../output-manager';

/**
 * Re-reads the CLI's installed version from disk, bypassing the in-memory
 * `getPackageJSON` cache. Returns `undefined` on read/parse failure.
 *
 * Only meaningful for JS installs — native binaries embed package.json in a
 * VFS snapshot that never changes.
 *
 * Isolated in its own module so tests can mock the disk read.
 */
export function getInstalledVersion(): string | undefined {
  try {
    // Walk up to the package root, mirroring getPackageJSON().
    let dir = dirname(
      typeof __dirname !== 'undefined'
        ? __dirname
        : fileURLToPath(import.meta.url)
    );
    let packageJsonPath = join(dir, 'package.json');
    while (!existsSync(packageJsonPath)) {
      const parent = dirname(dir);
      if (parent === dir) return undefined; // reached filesystem root
      dir = parent;
      packageJsonPath = join(dir, 'package.json');
    }
    const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return typeof manifest?.version === 'string' ? manifest.version : undefined;
  } catch (error) {
    output.debug(
      `Failed to re-read the installed CLI version: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return undefined;
  }
}
