import type { DetectorFilesystem } from '../detectors/filesystem';
import type {
  ServiceRuntime,
  ExperimentalServices,
  ServiceDetectionError,
} from './types';
import { RUNTIME_BUILDERS, ENTRYPOINT_EXTENSIONS } from './types';
import { isBackendFramework, isPythonFramework } from '@vercel/build-utils';

export function getBuilderForRuntime(runtime: ServiceRuntime): string {
  return RUNTIME_BUILDERS[runtime];
}

/**
 * Infer runtime from builder and/or framework.
 * - Backend frameworks (express, hono) → "node"
 * - Python frameworks (fastapi, flask) → "python"
 * - Known runtime builders (@vercel/python, @vercel/ruby, etc.) → that runtime
 */
export function inferRuntime(
  framework: string | undefined,
  builder: string | undefined
): ServiceRuntime | undefined {
  if (isBackendFramework(framework)) {
    return 'node';
  }
  if (isPythonFramework(framework)) {
    return 'python';
  }
  for (const [runtime, builderName] of Object.entries(RUNTIME_BUILDERS)) {
    if (builder === builderName) {
      return runtime as ServiceRuntime;
    }
  }

  return undefined;
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
