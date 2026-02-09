import {
  isBackendFramework,
  isPythonFramework,
} from '@vercel/build-utils/dist/framework-helpers';
import type { Route } from '@vercel/routing-utils';
import frameworkList from '@vercel/frameworks';
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
} from './types';

const frameworksBySlug = new Map(frameworkList.map(f => [f.slug, f]));

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
 * Default SPA fallback routes used when a framework doesn't define defaultRoutes.
 */
export const DEFAULT_SPA_ROUTES: Route[] = [
  { handle: 'filesystem' },
  { src: '/(.*)', dest: '/index.html' },
];

/**
 * Check if a framework can be mounted at a non-root prefix.
 *
 * Frameworks can be prefix-mounted if:
 * 1. They have no defaultRoutes
 * 2. Their defaultRoutes match our DEFAULT_SPA_ROUTES
 * 3. (Future) They provide getDefaultRoutesForPrefix
 */
export function frameworkSupportsPrefixMount(
  frameworkSlug: string | undefined
): boolean {
  if (!frameworkSlug) {
    return true;
  }

  const framework = frameworksBySlug.get(frameworkSlug);

  if (!framework?.defaultRoutes) {
    return true;
  }

  // Async defaultRoutes (like Gatsby) = can't check, not safe to prefix
  if (typeof framework.defaultRoutes === 'function') {
    return false;
  }

  // If defaultRoutes matches our standard SPA pattern, safe to prefix
  // (e.g., Svelte defines defaultRoutes but they're the same as DEFAULT_SPA_ROUTES)
  return isStandardSpaRoutes(framework.defaultRoutes);
}

/**
 * Check if routes match the standard SPA fallback pattern.
 */
function isStandardSpaRoutes(routes: Route[]): boolean {
  if (routes.length !== 2) return false;

  const [first, second] = routes;
  const isFilesystemHandle = 'handle' in first && first.handle === 'filesystem';
  const isSpaFallback =
    'src' in second && second.src === '/(.*)' && second.dest === '/index.html';

  return isFilesystemHandle && isSpaFallback;
}

/**
 * Get the default routes for a framework.
 * Returns the framework's defaultRoutes if defined, otherwise returns generic SPA routes.
 */
export async function getFrameworkDefaultRoutes(
  frameworkSlug: string | undefined,
  dirPrefix = '.'
): Promise<Route[]> {
  if (!frameworkSlug) {
    return DEFAULT_SPA_ROUTES;
  }

  const framework = frameworksBySlug.get(frameworkSlug);
  if (!framework?.defaultRoutes) {
    return DEFAULT_SPA_ROUTES;
  }

  if (typeof framework.defaultRoutes === 'function') {
    return await framework.defaultRoutes(dirPrefix);
  }

  return framework.defaultRoutes;
}

/**
 * Generate prefixed SPA routes for a service mounted at a non-root path.
 * Only used for frameworks that support prefix mounting (no custom defaultRoutes).
 */
export function getPrefixedSpaRoutes(prefix: string): Route[] {
  return [
    { handle: 'filesystem' },
    { src: `^/${prefix}(?:/(.*))?$`, dest: `/${prefix}/index.html` },
  ];
}

/**
 * Infer runtime from available service configuration.
 *
 * Priority (highest to lowest):
 * 1. Explicit runtime (user specified in config)
 * 2. Framework detection (fastapi → python, express → node)
 * 3. Builder detection (@vercel/python → python)
 * 4. Entrypoint extension (.py → python, .ts → node)
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
