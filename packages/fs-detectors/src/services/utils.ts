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
 * 1. They provide getDefaultRoutesForPrefix
 * 2. They have no defaultRoutes
 * 3. Their defaultRoutes match our DEFAULT_SPA_ROUTES
 */
export function frameworkSupportsPrefixMount(
  frameworkSlug: string | undefined
): boolean {
  if (!frameworkSlug) {
    return true;
  }

  const framework = frameworksBySlug.get(frameworkSlug);

  // Framework explicitly supports prefix mounting
  if (framework?.getDefaultRoutesForPrefix) {
    return true;
  }

  // No defaultRoutes = simple static, safe to prefix
  if (!framework?.defaultRoutes) {
    return true;
  }

  // Async defaultRoutes (like Gatsby) = can't check, not safe to prefix
  if (typeof framework.defaultRoutes === 'function') {
    return false;
  }

  // If defaultRoutes matches our standard SPA pattern, safe to prefix
  const defaultRoutesJson = JSON.stringify(DEFAULT_SPA_ROUTES);
  return JSON.stringify(framework.defaultRoutes) === defaultRoutesJson;
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
 * Get routes for a framework mounted at a non-root prefix.
 *
 * Priority:
 * 1. Use framework's getDefaultRoutesForPrefix if available
 * 2. Fall back to simple SPA routes
 *
 * Note: These routes are meant to be used AFTER handle:filesystem,
 * so they don't include the handle themselves. The handle is added
 * by the route merging process.
 */
export function getRoutesForPrefix(
  frameworkSlug: string | undefined,
  prefix: string
): Route[] {
  if (frameworkSlug) {
    const framework = frameworksBySlug.get(frameworkSlug);
    if (framework?.getDefaultRoutesForPrefix) {
      return framework.getDefaultRoutesForPrefix(prefix);
    }
  }

  // Simple SPA fallback - serve index.html for all paths under the prefix
  return [{ src: `^/${prefix}(?:/(.*))?$`, dest: `/${prefix}/index.html` }];
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
