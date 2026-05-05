import type { EnvVars, Service } from './types';

type Envs = { [key: string]: string | undefined };

interface FrameworkInfo {
  slug: string | null;
  envPrefix?: string;
}

export interface GetServiceUrlEnvVarsOptions {
  requestedEnv: EnvVars;
  consumerService?: Service;
  services: Service[];
  frameworkList: readonly FrameworkInfo[];
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

function getFrameworkEnvPrefix(
  frameworkSlug: string | undefined,
  frameworkList: readonly FrameworkInfo[]
): string | undefined {
  if (!frameworkSlug) return undefined;
  const framework = frameworkList.find(
    f => f.slug !== null && f.slug === frameworkSlug
  );
  return framework?.envPrefix;
}

/**
 * Resolve a map of declared env-var refs into concrete URL values.
 *
 * By default the value is the absolute URL of the referenced web service,
 * while if a consumer's framework has an `envPrefix`
 * (e.g. `NEXT_PUBLIC_` or `VITE_`) and the declared name starts with that prefix
 * then the target's route prefix (e.g. `/api`) is used,
 * which useful for client bundles where same-origin requests avoid CORS.
 *
 * Environment variables that are already set in `currentEnv` will NOT be overwritten,
 * allowing user-defined values to take precedence.
 */
export function getServiceUrlEnvVars(
  options: GetServiceUrlEnvVarsOptions
): Record<string, string> {
  const {
    requestedEnv,
    consumerService,
    services,
    frameworkList,
    currentEnv = {},
    deploymentUrl,
    origin,
  } = options;

  const baseUrl = origin || deploymentUrl;
  if (!baseUrl) return {};

  const servicesByName = new Map(services.map(s => [s.name, s]));
  const consumerEnvPrefix = getFrameworkEnvPrefix(
    consumerService?.framework,
    frameworkList
  );
  const result: Record<string, string> = {};

  for (const [name, envVar] of Object.entries(requestedEnv)) {
    if (name in currentEnv) {
      continue;
    }
    if (envVar.type !== 'service-ref') {
      continue;
    }
    const target = servicesByName.get(envVar.service);
    if (!target || target.type !== 'web' || !target.routePrefix) {
      continue;
    }

    const isClientSide =
      !!consumerEnvPrefix &&
      name.startsWith(consumerEnvPrefix) &&
      name.length > consumerEnvPrefix.length;

    result[name] = isClientSide
      ? target.routePrefix
      : computeServiceUrl(baseUrl, target.routePrefix, !!origin);
  }

  return result;
}
