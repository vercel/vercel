import {
  INTERNAL_SERVICE_PREFIX,
  getInternalServiceFunctionPath,
  getInternalServiceCronPathPrefix,
  getInternalServiceCronPath,
  getInternalServiceWorkerPathPrefix,
  getInternalServiceWorkerPath,
} from '@vercel/build-utils';
import type { DetectorFilesystem } from '../detectors/filesystem';
import { STATIC_BUILDERS, ROUTE_OWNING_BUILDERS } from './runtimes/constants';
import { isFrontendFramework, isBFFFramework } from './runtimes/framework';
import type {
  ExperimentalServices,
  ExperimentalServicesV2,
  InferredServicesConfig,
  Services,
  ServiceDetectionError,
  ServiceDetectionWarning,
  ResolvedService,
} from './types';

export {
  INTERNAL_SERVICE_PREFIX,
  getInternalServiceFunctionPath,
  getInternalServiceCronPathPrefix,
  getInternalServiceCronPath,
  getInternalServiceWorkerPathPrefix,
  getInternalServiceWorkerPath,
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

export interface ReadVercelConfigResult {
  config: {
    experimentalServices?: ExperimentalServices;
    services?: Services;
    experimentalServicesV2?: ExperimentalServicesV2;
  } | null;
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

  const hasVercelToml = await fs.hasPath('vercel.toml');
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

/**
 * Assign mount paths to inferred services.
 *
 * A frontend service gets `/`, backend services get `/api/...`:
 * - If the frontend is a BFF (e.g. Next.js, has its own API routes):
 *   backends get `/api/{name}/(.*)` to avoid shadowing the frontend's API routes.
 * - If the frontend is client-only (e.g. Vite):
 *   backends get `/api/(.*)`.
 *
 * A single non-frontend service gets `/`.
 * If no frontend service found, multiple services get `/api/{name}`.
 *
 * Priority for `/`: single service or frontend > name "frontend" or "web" > alphabetical.
 */
export function assignMountPaths(
  services: InferredServicesConfig
): ServiceDetectionWarning[] {
  const warnings: ServiceDetectionWarning[] = [];
  const names = Object.keys(services);

  if (names.length === 1) {
    services[names[0]].mountPath = '/';
    return warnings;
  }

  const frontendNames = names.filter(name =>
    isFrontendFramework(services[name].framework)
  );

  let rootName: string | null = null;
  if (frontendNames.length === 1) {
    rootName = frontendNames[0];
  } else if (frontendNames.length > 1) {
    rootName =
      frontendNames.find(n => n === 'frontend' || n === 'web') ??
      frontendNames.sort()[0];
    warnings.push({
      code: 'MULTIPLE_FRONTENDS',
      message: `Multiple frontend services detected (${frontendNames.join(', ')}). "${rootName}" was assigned mount path "/". Adjust manually if a different service should be the root.`,
    });
  }

  // BFF frontends (e.g. Next.js) have their own /api routes, so backend
  // services need a namespaced prefix to avoid conflicts.
  const rootFramework = rootName ? services[rootName].framework : undefined;
  const isBFF = rootFramework ? isBFFFramework(rootFramework) : false;

  // Count non-root services to determine if namespacing is needed.
  const nonRootNames = names.filter(n => n !== rootName);
  // For client-only frontends with exactly one non-root service, use /api
  // directly. For BFF frontends or multiple non-root services, namespace
  // by service name to avoid mount path conflicts.
  const needsNamespace = isBFF || nonRootNames.length > 1;

  for (const name of names) {
    if (name === rootName) {
      services[name].mountPath = '/';
    } else {
      services[name].mountPath = needsNamespace ? `/api/${name}` : '/api';
    }
  }

  return warnings;
}

export function combineBuildCommand(
  buildCommand: string | undefined,
  preDeployCommand: string | string[] | undefined
): string | undefined {
  const preDeploy = Array.isArray(preDeployCommand)
    ? preDeployCommand.join(' && ')
    : preDeployCommand;

  if (preDeploy && buildCommand) {
    return `${buildCommand} && ${preDeploy}`;
  } else if (preDeploy) {
    return preDeploy;
  } else {
    return buildCommand;
  }
}
