import {
  isBackendFramework,
  isPythonFramework,
} from '@vercel/build-utils/dist/framework-helpers';
import {
  INTERNAL_SERVICE_PREFIX,
  getInternalServiceFunctionPath,
  getInternalServiceCronPathPrefix,
  getInternalServiceCronPath,
} from '@vercel/build-utils';
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

export {
  INTERNAL_SERVICE_PREFIX,
  getInternalServiceFunctionPath,
  getInternalServiceCronPathPrefix,
  getInternalServiceCronPath,
};

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
 * Reserved internal namespace used by the dev queue proxy.
 */
export const INTERNAL_QUEUES_PREFIX = '/_svc/_queues';

function normalizeInternalServiceEntrypoint(entrypoint: string): string {
  const normalized = entrypoint
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\.[^/.]+$/, '');
  return normalized || 'index';
}

export function getInternalServiceWorkerPathPrefix(
  serviceName: string
): string {
  return `${INTERNAL_SERVICE_PREFIX}/${serviceName}/workers`;
}

export function getInternalServiceWorkerPath(
  serviceName: string,
  entrypoint: string,
  handler = 'worker'
): string {
  const normalizedEntrypoint = normalizeInternalServiceEntrypoint(entrypoint);
  return `${getInternalServiceWorkerPathPrefix(serviceName)}/${normalizedEntrypoint}/${handler}`;
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
 * Infer runtime from a framework slug.
 *
 * Examples:
 * - `python` -> `python`
 * - `fastapi` -> `python`
 * - `express` -> `node`
 */
export function inferRuntimeFromFramework(
  framework: string | null | undefined
): ServiceRuntime | undefined {
  if (!framework) {
    return undefined;
  }

  // Runtime framework slug maps directly to runtime name.
  if (framework in RUNTIME_BUILDERS) {
    return framework as ServiceRuntime;
  }

  if (isPythonFramework(framework)) {
    return 'python';
  }
  if (isBackendFramework(framework)) {
    return 'node';
  }

  return undefined;
}

export function isFrontendFramework(
  framework: string | null | undefined
): boolean {
  if (!framework) {
    return false;
  }
  return !inferRuntimeFromFramework(framework);
}

export function filterFrameworksByRuntime<T extends { slug?: string | null }>(
  frameworks: readonly T[],
  runtime?: ServiceRuntime
): T[] {
  if (!runtime) {
    return [...frameworks];
  }

  return frameworks.filter(
    framework => inferRuntimeFromFramework(framework.slug) === runtime
  );
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

  const frameworkRuntime = inferRuntimeFromFramework(config.framework);
  if (frameworkRuntime) {
    return frameworkRuntime;
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
 * Read and parse vercel.json or vercel.toml from filesystem.
 * Returns the parsed config or an error if the file exists but is invalid.
 */
export async function readVercelConfig(
  fs: DetectorFilesystem
): Promise<ReadVercelConfigResult> {
  const hasVercelJson = await fs.hasPath('vercel.json');
  if (hasVercelJson) {
    try {
      const content = await fs.readFile('vercel.json');
      const config = JSON.parse(content.toString());
      return { config, error: null };
    } catch {
      return {
        config: null,
        error: {
          code: 'INVALID_VERCEL_JSON',
          message:
            'Failed to parse vercel.json. Ensure it contains valid JSON.',
        },
      };
    }
  }

  const hasVercelToml =
    process.env.VERCEL_TOML_CONFIG_ENABLED === '1' &&
    (await fs.hasPath('vercel.toml'));
  if (hasVercelToml) {
    try {
      const { parse: tomlParse } = await import('smol-toml');
      const content = await fs.readFile('vercel.toml');
      const config = tomlParse(content.toString());
      return { config: config as any, error: null };
    } catch {
      return {
        config: null,
        error: {
          code: 'INVALID_VERCEL_TOML',
          message:
            'Failed to parse vercel.toml. Ensure it contains valid TOML.',
        },
      };
    }
  }

  return { config: null, error: null };
}
