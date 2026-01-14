/**
 * Manifest detection for service discovery.
 *
 * This module walks the project filesystem to find manifest files
 * (package.json, pyproject.toml, go.mod, etc.) that indicate
 * buildable services.
 */

import type { DetectorFilesystem } from '../detectors/filesystem';
import type { ServiceRuntime } from '@vercel/build-utils';
import type { DetectedManifest } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mapping of manifest files to their associated runtimes.
 */
export const MANIFEST_FILES: Record<string, ServiceRuntime> = {
  'package.json': 'node',
  'pyproject.toml': 'python',
  'requirements.txt': 'python',
  Pipfile: 'python',
  'go.mod': 'go',
  'Cargo.toml': 'rust',
  Gemfile: 'ruby',
};

/**
 * Directories to skip during manifest detection.
 */
export const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '.venv',
  'venv',
  'env',
  '.env',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  'dist',
  'build',
  'out',
  '.vercel',
  '.next',
  '.nuxt',
  '.output',
  '.svelte-kit',
  'target',
  'vendor',
  'pkg',
  '.bundle',
  'coverage',
  '.turbo',
  '.cache',
]);

/**
 * Maximum depth to search for manifests from the project root.
 */
export const MAX_MANIFEST_SEARCH_DEPTH = 3;

// ═══════════════════════════════════════════════════════════════════════════
// Main Detection Function
// ═══════════════════════════════════════════════════════════════════════════

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
            IGNORED_DIRECTORIES.has(entry.name) ||
            entry.name.startsWith('.')
          ) {
            continue;
          }
          await walk(entryPath, depth + 1);
        }
      }
    } catch {
      // Silently skip unreadable directories
    }
  }

  await walk('.', 0);
  return manifests;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Groups detected manifests by their containing directory.
 */
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
 * Get the primary runtime for a directory based on its manifests.
 * Priority: node > python > go > rust > ruby
 */
export function getPrimaryRuntime(
  manifests: DetectedManifest[]
): ServiceRuntime {
  const runtimes = new Set(manifests.map(m => m.runtime));
  if (runtimes.has('node')) return 'node';
  if (runtimes.has('python')) return 'python';
  if (runtimes.has('go')) return 'go';
  if (runtimes.has('rust')) return 'rust';
  if (runtimes.has('ruby')) return 'ruby';
  return manifests[0].runtime;
}

/**
 * Check if a directory has conflicting runtimes.
 */
export function hasConflictingRuntimes(manifests: DetectedManifest[]): boolean {
  const runtimes = new Set(manifests.map(m => m.runtime));
  return runtimes.size > 1;
}
