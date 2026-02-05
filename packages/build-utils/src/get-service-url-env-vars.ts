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
}

/**
 * Convert service name to environment variable name.
 * e.g., "frontend" → "FRONTEND_URL", "api-users" → "API_USERS_URL"
 */
function serviceNameToEnvVar(name: string): string {
  return `${name.replace(/-/g, '_').toUpperCase()}_URL`;
}

function computeServiceUrl(deploymentUrl: string, routePrefix: string): string {
  if (routePrefix === '/') {
    return `https://${deploymentUrl}`;
  }

  const normalizedPrefix = routePrefix.startsWith('/')
    ? routePrefix.slice(1)
    : routePrefix;
  return `https://${deploymentUrl}/${normalizedPrefix}`;
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
 * 1. A base env var (e.g., BACKEND_URL)
 * 2. Framework-prefixed versions for each frontend framework in the deployment
 *    (e.g., VITE_BACKEND_URL, NEXT_PUBLIC_BACKEND_URL) so they can be accessed
 *    in client-side code.
 *
 * Environment variables that are already set in `currentEnv` will NOT be overwritten,
 * allowing user-defined values to take precedence.
 */
export function getServiceUrlEnvVars(
  options: GetServiceUrlEnvVarsOptions
): Record<string, string> {
  const { services, frameworkList, currentEnv = {}, deploymentUrl } = options;

  // Can't generate service URLs without a deployment URL
  if (!deploymentUrl || !services || services.length === 0) {
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
    const url = computeServiceUrl(deploymentUrl, service.routePrefix);

    // Add the base env var (e.g., BACKEND_URL) if not already set
    if (!(baseEnvVarName in currentEnv)) {
      envVars[baseEnvVarName] = url;
    }

    // Add framework-prefixed versions for each frontend framework in the deployment
    // e.g., VITE_BACKEND_URL, NEXT_PUBLIC_BACKEND_URL
    for (const prefix of frameworkPrefixes) {
      const prefixedEnvVarName = `${prefix}${baseEnvVarName}`;
      if (!(prefixedEnvVarName in currentEnv)) {
        envVars[prefixedEnvVarName] = url;
      }
    }
  }

  return envVars;
}
