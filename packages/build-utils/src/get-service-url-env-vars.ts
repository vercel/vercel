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

export interface GetExperimentalServiceUrlEnvVarsOptions {
  services: Service[];
  frameworkList: readonly FrameworkInfo[];
  currentEnv?: Envs;
  deploymentUrl?: string;
  origin?: string;
}

/**
 * Convert service name to env-var name: "frontend" → "FRONTEND_URL",
 * "api-users" → "API_USERS_URL".
 */
function serviceNameToEnvVar(name: string): string {
  return `${name.replace(/-/g, '_').toUpperCase()}_URL`;
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

/**
 * Legacy implicit URL injection used for `experimentalServices` (and
 * auto-detected services that map to the experimentalServices shape).
 *
 * For each web service, generates:
 * 1. `{NAME}_URL` with the absolute URL (server-side use).
 * 2. `{PREFIX}{NAME}_URL` for every framework prefix in `frameworkList` that
 *    matches a service in the deployment, with the relative route prefix
 *    (client-side use; relative paths avoid CORS).
 *
 * Entries already present in `currentEnv` are not overwritten — user-defined
 * values win.
 *
 * The GA `services` field replaces this with explicit `env` declarations
 * handled by `getServiceUrlEnvVars`.
 */
export function getExperimentalServiceUrlEnvVars(
  options: GetExperimentalServiceUrlEnvVarsOptions
): Record<string, string> {
  const {
    services,
    frameworkList,
    currentEnv = {},
    deploymentUrl,
    origin,
  } = options;

  const baseUrl = origin || deploymentUrl;
  if (!baseUrl || !services || services.length === 0) {
    return {};
  }

  const envVars: Record<string, string> = {};

  // Collect framework prefixes from any frontend services in the deployment,
  // so each web service gets a prefixed twin per framework (NEXT_PUBLIC_*,
  // VITE_*, …) for client-side use.
  const frameworkPrefixes = new Set<string>();
  for (const service of services) {
    const prefix = getFrameworkEnvPrefix(service.framework, frameworkList);
    if (prefix) {
      frameworkPrefixes.add(prefix);
    }
  }

  for (const service of services) {
    if (service.type !== 'web' || !service.routePrefix) {
      continue;
    }

    const baseEnvVarName = serviceNameToEnvVar(service.name);
    const absoluteUrl = computeServiceUrl(
      baseUrl,
      service.routePrefix,
      !!origin
    );

    if (!(baseEnvVarName in currentEnv)) {
      envVars[baseEnvVarName] = absoluteUrl;
    }

    for (const prefix of frameworkPrefixes) {
      const prefixedEnvVarName = `${prefix}${baseEnvVarName}`;
      if (!(prefixedEnvVarName in currentEnv)) {
        envVars[prefixedEnvVarName] = service.routePrefix;
      }
    }
  }

  return envVars;
}
