import type { DetectorFilesystem } from '../detectors/filesystem';
import type { ServiceRuntime } from '@vercel/build-utils';

export interface RuntimeEntrypointConfig {
  patterns: string[];
  extensions: string[];
}

export const RUNTIME_ENTRYPOINTS: Record<
  ServiceRuntime,
  RuntimeEntrypointConfig
> = {
  node: {
    patterns: [
      'index',
      'app',
      'server',
      'main',
      'handler',
      'src/index',
      'src/app',
      'src/server',
    ],
    extensions: ['ts', 'mts', 'js', 'mjs', 'cjs'],
  },
  python: {
    patterns: [
      'index',
      'main',
      'app',
      'server',
      'asgi',
      'wsgi',
      'src/index',
      'src/main',
      'src/app',
      'src/server',
    ],
    extensions: ['py'],
  },
  go: {
    patterns: [
      'main',
      'server',
      'cmd/api/main',
      'cmd/server/main',
      'cmd/web/main',
    ],
    extensions: ['go'],
  },
  rust: {
    patterns: ['src/main', 'src/lib', 'server'],
    extensions: ['rs'],
  },
  ruby: {
    patterns: ['config', 'app', 'server'],
    extensions: ['rb', 'ru'],
  },
};

export interface DetectedEntrypoint {
  path: string;
  runtime: ServiceRuntime;
}

function generateEntrypointPaths(config: RuntimeEntrypointConfig): string[] {
  const paths: string[] = [];
  for (const pattern of config.patterns) {
    for (const ext of config.extensions) {
      paths.push(`${pattern}.${ext}`);
    }
  }
  return paths;
}

/**
 * Detect a single entrypoint for a specific runtime in a directory.
 * Returns the first matching entrypoint file path, or null if none found.
 */
async function detectEntrypoint(
  fs: DetectorFilesystem,
  runtime: ServiceRuntime,
  workDir: string
): Promise<string | null> {
  const config = RUNTIME_ENTRYPOINTS[runtime];
  if (!config) return null;

  const paths = generateEntrypointPaths(config);
  for (const path of paths) {
    const fullPath = workDir === '.' ? path : `${workDir}/${path}`;
    const exists = await fs.hasPath(fullPath);
    if (exists) {
      return fullPath;
    }
  }

  return null;
}

/**
 * Detect all entrypoints across all runtimes in a directory.
 * Used for conflict detection - if multiple entrypoints are found,
 * we can't auto-detect which service to use.
 */
export async function detectAllEntrypoints(
  fs: DetectorFilesystem,
  workDir: string,
  runtimes: ServiceRuntime[]
): Promise<DetectedEntrypoint[]> {
  const detected: DetectedEntrypoint[] = [];

  for (const runtime of runtimes) {
    const entrypoint = await detectEntrypoint(fs, runtime, workDir);
    if (entrypoint) {
      detected.push({ path: entrypoint, runtime });
    }
  }

  return detected;
}
