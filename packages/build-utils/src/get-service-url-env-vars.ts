import type { Service } from './types';

type Envs = { [key: string]: string | undefined };

export interface ResolveServiceEnvVarsOptions {
  targetService: Service;
  services: Service[];
  currentEnv?: Envs;
  deploymentUrl?: string;
  origin?: string;
}

function computeServiceUrl(
  baseUrl: string,
  routePrefix: string,
  isOrigin: boolean
): string {
  if (!isOrigin) {
    // This is deployment host, needs https:// prefix
    baseUrl = `https://${baseUrl}`;
  }

  if (routePrefix === '/') {
    return baseUrl;
  }

  const normalizedPrefix = routePrefix.startsWith('/')
    ? routePrefix.slice(1)
    : routePrefix;
  return `${baseUrl}/${normalizedPrefix}`;
}

/**
 * Resolve the `envVars` declared on a single consumer service into a flat
 * map of environment variables to inject into that service's build, dev,
 * or runtime environment.
 *
 * Each declared entry produces exactly one variable. By default the value
 * is the absolute URL of the referenced web service. Set `relative: true`
 * on an entry to instead inject the target's route prefix (e.g. `/api`),
 * useful for client bundles where same-origin requests avoid CORS.
 *
 * Any variable already present in `currentEnv` is skipped so user-supplied
 * overrides (from `.env`, `vercel env pull`, or the shell) always win.
 *
 * Non-web target services and unknown refs are validated upstream in
 * `@vercel/fs-detectors`; this function defensively skips them.
 */
export function resolveServiceEnvVars(
  options: ResolveServiceEnvVarsOptions
): Record<string, string> {
  const {
    targetService: service,
    services,
    currentEnv = {},
    deploymentUrl,
    origin,
  } = options;

  if (!service.envVars) {
    return {};
  }

  const baseUrl = origin || deploymentUrl;
  if (!baseUrl) {
    return {};
  }

  const servicesByName = new Map(services.map(s => [s.name, s]));
  const result: Record<string, string> = {};

  for (const [name, envVar] of Object.entries(service.envVars)) {
    if (name in currentEnv) {
      continue;
    }
    const target = servicesByName.get(envVar.ref.service);
    if (!target || target.type !== 'web' || !target.routePrefix) {
      continue;
    }

    result[name] = envVar.relative
      ? target.routePrefix
      : computeServiceUrl(baseUrl, target.routePrefix, !!origin);
  }

  return result;
}
