import type { Service } from './types';

type Envs = { [key: string]: string | undefined };

interface FrameworkInfo {
  slug: string | null;
  envPrefix?: string;
}

export interface GetServiceUrlEnvVarsOptions {
  services: Service[];
  frameworkList: readonly FrameworkInfo[];
  currentEnv?: Envs;
  deploymentUrl?: string;
  origin?: string;
}

/**
 * Convert service name to environment variable name.
 * e.g., "frontend" → "FRONTEND_URL", "api-users" → "API_USERS_URL"
 */
function serviceNameToEnvVar(name: string): string {
  return `${name.replace(/-/g, '_').toUpperCase()}_URL`;
}

function computeServiceUrl(
  baseUrl: string,
  routePrefix: string,
  isOrigin: boolean
): string {
  if (!isOrigin && routePrefix === '/') {
    // This is deployment host
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
 * Get the framework's envPrefix (e.g., "VITE_", "NEXT_PUBLIC_") from the framework slug.
 */
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
 * Generate environment variables for service URLs.
 *
 * For each web service, generates:
 * 1. A base env var with the full absolute URL (e.g., BACKEND_URL=https://deploy.vercel.app/api)
 *    for server-side use.
 * 2. Framework-prefixed versions with only the route prefix path
 *    (e.g., NEXT_PUBLIC_BACKEND_URL=/api, VITE_BACKEND_URL=/api) for client-side use.
 *    Using relative paths avoids CORS issues since the browser resolves them against
 *    the current origin, which works correctly across production domains, preview
 *    deployments, and custom domains.
 *
 * Environment variables that are already set in `currentEnv` will NOT be overwritten,
 * allowing user-defined values to take precedence.
 */
export function getServiceUrlEnvVars(
  options: GetServiceUrlEnvVarsOptions
): Record<string, string> {
  const {
    services,
    frameworkList,
    currentEnv = {},
    deploymentUrl,
    origin,
  } = options;

  const baseUrl = origin || deploymentUrl;

  // Can't generate service URLs without a base URL
  if (!baseUrl || !services || services.length === 0) {
    return {};
  }

  const envVars: Record<string, string> = {};

  // Collect all unique env prefixes from frontend frameworks in the deployment
  const frameworkPrefixes = new Set<string>();
  for (const service of services) {
    const prefix = getFrameworkEnvPrefix(service.framework, frameworkList);
    if (prefix) {
      frameworkPrefixes.add(prefix);
    }
  }

  for (const service of services) {
    // Only web services have URLs - skip crons and workers
    if (service.type !== 'web' || !service.routePrefix) {
      continue;
    }

    const baseEnvVarName = serviceNameToEnvVar(service.name);
    const absoluteUrl = computeServiceUrl(
      baseUrl,
      service.routePrefix,
      !!origin
    );

    // Add the base env var with full absolute URL (e.g., BACKEND_URL)
    // for server-side use where relative paths won't resolve
    if (!(baseEnvVarName in currentEnv)) {
      envVars[baseEnvVarName] = absoluteUrl;
    }

    // Add framework-prefixed versions with only the route prefix path
    // (e.g., NEXT_PUBLIC_BACKEND_URL, VITE_BACKEND_URL) for client-side use.
    // Using relative paths ensures the browser resolves requests against the
    // current origin, avoiding CORS errors when the deployment URL differs
    // from the production/custom domain.
    for (const prefix of frameworkPrefixes) {
      const prefixedEnvVarName = `${prefix}${baseEnvVarName}`;
      if (!(prefixedEnvVarName in currentEnv)) {
        envVars[prefixedEnvVarName] = service.routePrefix;
      }
    }
  }

  return envVars;
}
