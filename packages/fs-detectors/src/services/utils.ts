import {
  isBackendFramework,
  isPythonFramework,
} from '@vercel/build-utils/dist/framework-helpers';
import type { DetectorFilesystem } from '../detectors/filesystem';
import type {
  ServiceRuntime,
  ExperimentalServices,
  ServiceDetectionError,
  ResolvedService,
} from './types';
import {
  RUNTIME_BUILDERS,
  ENTRYPOINT_EXTENSIONS,
  STATIC_BUILDERS,
  ROUTE_OWNING_BUILDERS,
} from './types';

export async function hasFile(
  fs: DetectorFilesystem,
  filePath: string
): Promise<boolean> {
  try {
    return await fs.isFile(filePath);
  } catch {
    return false;
  }
}

/**
 * Reserved internal namespace used by services routing/runtime plumbing.
 */
export const INTERNAL_SERVICE_PREFIX = '/_svc';

export function getInternalServiceFunctionPath(serviceName: string): string {
  return `${INTERNAL_SERVICE_PREFIX}/${serviceName}/index`;
}

export function getBuilderForRuntime(runtime: ServiceRuntime): string {
  const builder = RUNTIME_BUILDERS[runtime];
  if (!builder) {
    throw new Error(`Unknown runtime: ${runtime}`);
  }
  return builder;
}

export function isStaticBuild(service: ResolvedService): boolean {
  return STATIC_BUILDERS.has(service.builder.use);
}

/**
 * Determines if a service uses a "route-owning" builder.
 *
 * Route-owning builders (e.g., `@vercel/next`, `@vercel/backends`) produce
 * their own full route table with handle phases (filesystem, miss, rewrite,
 * hit, error). The services system should NOT generate synthetic catch-all
 * rewrites for them — instead, we rely on the builder's own `routes[]`.
 */
export function isRouteOwningBuilder(service: ResolvedService): boolean {
  return ROUTE_OWNING_BUILDERS.has(service.builder.use);
}

/**
 * Infer runtime from available service configuration.
 *
 * Priority (highest to lowest):
 * 1. Explicit runtime (user specified in config)
 * 2. Runtime framework slug (ruby → ruby, go → go)
 * 3. Framework detection (fastapi → python, express → node)
 * 4. Builder detection (@vercel/python → python)
 * 5. Entrypoint extension (.py → python, .ts → node)
 *
 * @returns The inferred runtime, or undefined if none can be determined.
 */
export function inferServiceRuntime(config: {
  runtime?: string;
  framework?: string;
  builder?: string;
  entrypoint?: string;
}): ServiceRuntime | undefined {
  // Explicit runtime takes priority
  if (config.runtime && config.runtime in RUNTIME_BUILDERS) {
    return config.runtime as ServiceRuntime;
  }

  // Runtime framework slug maps directly to runtime name.
  if (config.framework && config.framework in RUNTIME_BUILDERS) {
    return config.framework as ServiceRuntime;
  }

  // Infer from framework
  if (isPythonFramework(config.framework)) {
    return 'python';
  }
  if (isBackendFramework(config.framework)) {
    return 'node';
  }

  // Infer from builder
  if (config.builder) {
    for (const [runtime, builderName] of Object.entries(RUNTIME_BUILDERS)) {
      if (config.builder === builderName) {
        return runtime as ServiceRuntime;
      }
    }
  }

  // Infer from entrypoint extension
  if (config.entrypoint) {
    for (const [ext, runtime] of Object.entries(ENTRYPOINT_EXTENSIONS)) {
      if (config.entrypoint.endsWith(ext)) {
        return runtime;
      }
    }
  }

  return undefined;
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
