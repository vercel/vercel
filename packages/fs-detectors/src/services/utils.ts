import type { DetectorFilesystem } from '../detectors/filesystem';
import {
  RUNTIME_BUILDERS,
  ServiceRuntime,
  ENTRYPOINT_EXTENSIONS,
  ExperimentalServices,
  ServiceDetectionError,
} from './types';

export function getBuilderForRuntime(runtime: ServiceRuntime): string {
  return RUNTIME_BUILDERS[runtime];
}

export function inferRuntimeFromExtension(
  entrypoint: string
): ServiceRuntime | null {
  for (const [ext, runtime] of Object.entries(ENTRYPOINT_EXTENSIONS)) {
    if (entrypoint.endsWith(ext)) {
      return runtime;
    }
  }
  return null;
}

export interface ReadVercelConfigResult {
  config: { experimentalServices?: ExperimentalServices } | null;
  error: ServiceDetectionError | null;
}

/**
 * Read and parse vercel.json from filesystem.
 * Returns the parsed config or an error if the file exists but is invalid.
 */
export async function readVercelConfig(
  fs: DetectorFilesystem
): Promise<ReadVercelConfigResult> {
  const hasVercelJson = await fs.hasPath('vercel.json');
  if (!hasVercelJson) {
    return { config: null, error: null };
  }

  try {
    const content = await fs.readFile('vercel.json');
    const config = JSON.parse(content.toString());
    return { config, error: null };
  } catch {
    return {
      config: null,
      error: {
        code: 'INVALID_VERCEL_JSON',
        message: 'Failed to parse vercel.json. Ensure it contains valid JSON.',
      },
    };
  }
}
