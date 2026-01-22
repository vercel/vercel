import type { DetectorFilesystem } from '../../detectors/filesystem';
import type { ServiceRuntime } from '@vercel/build-utils';
import type { DetectedManifest } from '../types';
import { COMMON_IGNORED_DIRECTORIES } from '../../constants';
import { debug } from 'console';

export const MANIFEST_FILES: Record<string, ServiceRuntime> = {
  'package.json': 'node',
  'pyproject.toml': 'python',
  'requirements.txt': 'python',
  Pipfile: 'python',
  'go.mod': 'go',
  'Cargo.toml': 'rust',
  Gemfile: 'ruby',
};

// Maximum depth to search for manifests from the project root.
const MAX_MANIFEST_SEARCH_DEPTH = 3;

/**
 * Detects all manifest files in a project by walking the directory tree.
 *
 * @example
 * ```typescript
 * const manifests = await detectManifests(fs);
 * // [
 * //   { path: 'package.json', directory: '.', runtime: 'node', file: 'package.json' },
 * //   { path: 'backend/pyproject.toml', directory: 'backend', runtime: 'python', file: 'pyproject.toml' }
 * // ]
 * ```
 */
export async function detectManifests(
  fs: DetectorFilesystem,
  maxDepth: number = MAX_MANIFEST_SEARCH_DEPTH
): Promise<DetectedManifest[]> {
  const manifests: DetectedManifest[] = [];
  const manifestFileNames = new Set(Object.keys(MANIFEST_FILES));

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    try {
      const entries = await fs.readdir(dir);

      for (const entry of entries) {
        const entryPath = dir === '.' ? entry.name : `${dir}/${entry.name}`;

        if (entry.type === 'file') {
          if (manifestFileNames.has(entry.name)) {
            manifests.push({
              path: entryPath,
              directory: dir,
              runtime: MANIFEST_FILES[entry.name],
              file: entry.name,
            });
          }
        } else if (entry.type === 'dir') {
          // Skip ignored and hidden directories
          if (
            COMMON_IGNORED_DIRECTORIES.has(entry.name) ||
            entry.name.startsWith('.')
          ) {
            continue;
          }
          await walk(entryPath, depth + 1);
        }
      }
    } catch {
      debug(`Skipping unreadable directory: ${dir}`);
    }
  }

  await walk('.', 0);
  return manifests;
}

export function groupManifestsByDirectory(
  manifests: DetectedManifest[]
): Map<string, DetectedManifest[]> {
  const grouped = new Map<string, DetectedManifest[]>();

  for (const manifest of manifests) {
    const existing = grouped.get(manifest.directory);
    if (existing) {
      existing.push(manifest);
    } else {
      grouped.set(manifest.directory, [manifest]);
    }
  }

  return grouped;
}

/**
 * In zero-config services detection, a service base directory can't have more than one
 * detected service because we'd have no way to disambiguate how to route requests.
 *
 * For example, if a directory has both `server.ts` and `server.py`, we can't determine
 * which service should handle a given request since they'd both be mounted at the same path.
 *
 * Note: Having multiple manifest files (e.g. `package.json` + `pyproject.toml`) in the same
 * directory is fine as long as only one service entrypoint is detected.
 *
 * @param detectedEntrypoints - Array of entrypoint paths detected in the same directory
 */
export function hasConflictingServices(detectedEntrypoints: string[]): boolean {
  return detectedEntrypoints.length > 1;
}
