/**
 * Entrypoint detection for services.
 *
 * This module handles finding the main entrypoint file for a service,
 * either by verifying an explicitly configured path or by auto-detecting
 * based on common conventions.
 */

import type { DetectorFilesystem } from '../detectors/filesystem';
import type { ServiceRuntime } from '@vercel/build-utils';

// ═══════════════════════════════════════════════════════════════════════════
// Zero-Config Entrypoint Patterns
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Entrypoint patterns to search for each runtime during zero-config detection.
 * Ordered by priority (first match wins).
 */
export const ZERO_CONFIG_ENTRYPOINTS: Record<ServiceRuntime, string[]> = {
  node: [
    'index.ts',
    'index.mts',
    'index.js',
    'index.mjs',
    'index.cjs',
    'app.ts',
    'app.mts',
    'app.js',
    'app.mjs',
    'server.ts',
    'server.mts',
    'server.js',
    'server.mjs',
    'main.ts',
    'main.mts',
    'main.js',
    'main.mjs',
    'src/index.ts',
    'src/index.mts',
    'src/index.js',
    'src/index.mjs',
    'src/app.ts',
    'src/app.mts',
    'src/app.js',
    'src/app.mjs',
    'src/server.ts',
    'src/server.mts',
    'src/server.js',
    'src/server.mjs',
  ],
  python: [
    'index.py',
    'main.py',
    'app.py',
    'server.py',
    'asgi.py',
    'wsgi.py',
    'src/index.py',
    'src/main.py',
    'src/app.py',
    'src/server.py',
  ],
  go: [
    'main.go',
    'server.go',
    'cmd/api/main.go',
    'cmd/server/main.go',
    'cmd/web/main.go',
  ],
  rust: ['src/main.rs', 'src/lib.rs', 'server.rs'],
  ruby: ['config.ru', 'app.rb', 'server.rb'],
};

// ═══════════════════════════════════════════════════════════════════════════
// Main Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verifies that an explicitly configured entrypoint exists.
 *
 * @param fs - The detector filesystem
 * @param entrypoint - The configured entrypoint path
 * @param workDir - The working directory (service root)
 * @returns The entrypoint path if it exists, null otherwise
 */
export async function verifyEntrypoint(
  fs: DetectorFilesystem,
  entrypoint: string,
  workDir: string
): Promise<string | null> {
  const fullPath = workDir === '.' ? entrypoint : `${workDir}/${entrypoint}`;
  const exists = await fs.hasPath(fullPath);
  return exists ? fullPath : null;
}

/**
 * Auto-detects an entrypoint for a service based on runtime conventions.
 *
 * @param fs - The detector filesystem
 * @param runtime - The runtime to detect for
 * @param workDir - The working directory (service root)
 * @returns The first matching entrypoint, or null if none found
 */
export async function detectEntrypoint(
  fs: DetectorFilesystem,
  runtime: ServiceRuntime,
  workDir: string
): Promise<string | null> {
  const patterns = ZERO_CONFIG_ENTRYPOINTS[runtime];
  if (!patterns) return null;

  for (const pattern of patterns) {
    const fullPath = workDir === '.' ? pattern : `${workDir}/${pattern}`;
    const exists = await fs.hasPath(fullPath);
    if (exists) {
      return fullPath;
    }
  }

  return null;
}

/**
 * Tries to auto-detect an entrypoint for any supported runtime.
 * Used when runtime is unknown and we need to discover it.
 *
 * @param fs - The detector filesystem
 * @param workDir - The working directory (service root)
 * @returns Object with entrypoint and detected runtime, or null
 */
export async function detectAnyEntrypoint(
  fs: DetectorFilesystem,
  workDir: string
): Promise<{ entrypoint: string; runtime: ServiceRuntime } | null> {
  // Order of runtime detection priority
  const runtimeOrder: ServiceRuntime[] = [
    'node',
    'python',
    'go',
    'rust',
    'ruby',
  ];

  for (const runtime of runtimeOrder) {
    const entrypoint = await detectEntrypoint(fs, runtime, workDir);
    if (entrypoint) {
      return { entrypoint, runtime };
    }
  }

  return null;
}

/**
 * Gets the runtime from a file extension.
 */
export function getRuntimeFromExtension(
  filename: string
): ServiceRuntime | null {
  const ext = filename.slice(filename.lastIndexOf('.'));
  const mapping: Record<string, ServiceRuntime> = {
    '.ts': 'node',
    '.mts': 'node',
    '.js': 'node',
    '.mjs': 'node',
    '.cjs': 'node',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.rb': 'ruby',
  };
  return mapping[ext] ?? null;
}
