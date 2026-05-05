import { normalizeRoutePrefix } from '@vercel/routing-utils';
import type { ExperimentalServiceConfig, ServiceDetectionError } from './types';
import { INTERNAL_SERVICE_PREFIX } from './utils';

export interface ResolvedServiceRoutingConfig {
  routePrefix?: string;
  subdomain?: string;
  routePrefixConfigured: boolean;
  routingPaths?: string[];
}

type NormalizeRoutingPathsResult =
  | { paths: string[] }
  | { error: ServiceDetectionError };

type ResolveServiceRoutingResult =
  | { routing: ResolvedServiceRoutingConfig }
  | { error: ServiceDetectionError };

const ROUTING_PATTERN_HINT_RE = /[:*()[\]?+|^$]/;

export function isReservedServiceRoutePrefix(routePrefix: string): boolean {
  const normalized = normalizeRoutePrefix(routePrefix);
  return (
    normalized === INTERNAL_SERVICE_PREFIX ||
    normalized.startsWith(`${INTERNAL_SERVICE_PREFIX}/`)
  );
}

/**
 * Normalize a `routing.paths` array into a canonical, deduped set of subtree
 * prefixes or return the first validation error encountered.
 */
function normalizeRoutingPaths(
  name: string,
  paths: unknown
): NormalizeRoutingPathsResult {
  if (!Array.isArray(paths) || paths.length === 0) {
    return {
      error: {
        code: 'INVALID_ROUTING',
        message: `Service "${name}" has invalid "routing" config. "routing.paths" must be a non-empty array of concrete paths like "/docs".`,
        serviceName: name,
      },
    };
  }

  const normalizedPaths: string[] = [];
  const seen = new Set<string>();

  for (const value of paths) {
    if (typeof value !== 'string') {
      return {
        error: {
          code: 'INVALID_ROUTING',
          message: `Service "${name}" has invalid "routing" config. Each entry in "routing.paths" must be a string.`,
          serviceName: name,
        },
      };
    }

    if (!value.startsWith('/')) {
      return {
        error: {
          code: 'INVALID_ROUTING',
          message: `Service "${name}" has invalid routing path "${value}". Routing paths must start with "/".`,
          serviceName: name,
        },
      };
    }

    if (ROUTING_PATTERN_HINT_RE.test(value)) {
      return {
        error: {
          code: 'UNSUPPORTED_ROUTING_PATTERN',
          message: `Service "${name}" has unsupported routing path "${value}". Services routing only supports concrete subtree paths like "/docs". Use microfrontends for dynamic or pattern-based app composition.`,
          serviceName: name,
        },
      };
    }

    const normalized = normalizeRoutePrefix(value);
    if (isReservedServiceRoutePrefix(normalized)) {
      return {
        error: {
          code: 'RESERVED_ROUTE_PREFIX',
          message: `Web service "${name}" cannot use routing path "${normalized}". The "${INTERNAL_SERVICE_PREFIX}" prefix is reserved for internal services routing.`,
          serviceName: name,
        },
      };
    }

    if (!seen.has(normalized)) {
      seen.add(normalized);
      normalizedPaths.push(normalized);
    }
  }

  return { paths: normalizedPaths };
}

/**
 * Resolve a service's routing configuration (mount / routing / legacy keys)
 * into a canonical form. This is the single place where routing config is
 * normalized before validation and resolution consume it.
 */
export function resolveServiceRoutingConfig(
  name: string,
  config: ExperimentalServiceConfig
): ResolveServiceRoutingResult {
  const hasLegacyRoutePrefix = typeof config.routePrefix === 'string';
  const hasLegacySubdomain = typeof config.subdomain === 'string';
  const hasRouting = config.routing !== undefined;

  if (config.mount === undefined && !hasRouting) {
    return {
      routing: {
        routePrefix: config.routePrefix,
        subdomain: config.subdomain,
        routePrefixConfigured: hasLegacyRoutePrefix,
      },
    };
  }

  if (
    config.mount !== undefined &&
    (hasLegacyRoutePrefix || hasLegacySubdomain || hasRouting)
  ) {
    return {
      error: {
        code: 'CONFLICTING_MOUNT_CONFIG',
        message: `Service "${name}" cannot mix "mount" with "routing", "routePrefix", or "subdomain". Use only one routing configuration style.`,
        serviceName: name,
      },
    };
  }

  if (hasRouting) {
    if (hasLegacyRoutePrefix || hasLegacySubdomain) {
      return {
        error: {
          code: 'CONFLICTING_ROUTING_CONFIG',
          message: `Service "${name}" cannot mix "routing" with "routePrefix" or "subdomain". Use only one routing configuration style.`,
          serviceName: name,
        },
      };
    }

    if (
      !config.routing ||
      typeof config.routing !== 'object' ||
      Array.isArray(config.routing)
    ) {
      return {
        error: {
          code: 'INVALID_ROUTING',
          message: `Service "${name}" has invalid "routing" config. Use an object like { paths: ["/docs"] }.`,
          serviceName: name,
        },
      };
    }

    const hasInvalidRoutingKeys = Object.keys(config.routing).some(
      key => key !== 'paths'
    );
    if (hasInvalidRoutingKeys) {
      return {
        error: {
          code: 'INVALID_ROUTING',
          message: `Service "${name}" has invalid "routing" config. Only "paths" is supported.`,
          serviceName: name,
        },
      };
    }

    const normalizedRouting = normalizeRoutingPaths(name, config.routing.paths);
    if ('error' in normalizedRouting) {
      return normalizedRouting;
    }

    return {
      routing: {
        routePrefixConfigured: false,
        routingPaths: normalizedRouting.paths,
      },
    };
  }

  if (typeof config.mount === 'string') {
    return {
      routing: {
        routePrefix: config.mount,
        routePrefixConfigured: true,
      },
    };
  }

  if (
    !config.mount ||
    typeof config.mount !== 'object' ||
    Array.isArray(config.mount)
  ) {
    return {
      error: {
        code: 'INVALID_MOUNT',
        message: `Service "${name}" has invalid "mount" config. Use a string path such as "/api" or an object like { path: "/api", subdomain: "api" }.`,
        serviceName: name,
      },
    };
  }

  const hasInvalidMountKeys = Object.keys(config.mount).some(
    key => key !== 'path' && key !== 'subdomain'
  );
  if (hasInvalidMountKeys) {
    return {
      error: {
        code: 'INVALID_MOUNT',
        message: `Service "${name}" has invalid "mount" config. Only "path" and "subdomain" are supported.`,
        serviceName: name,
      },
    };
  }

  const mountPath = config.mount.path;
  const mountSubdomain = config.mount.subdomain;
  if (
    (mountPath !== undefined && typeof mountPath !== 'string') ||
    (mountSubdomain !== undefined && typeof mountSubdomain !== 'string')
  ) {
    return {
      error: {
        code: 'INVALID_MOUNT',
        message: `Service "${name}" has invalid "mount" config. "path" and "subdomain" must be strings when provided.`,
        serviceName: name,
      },
    };
  }

  if (typeof mountPath !== 'string' && typeof mountSubdomain !== 'string') {
    return {
      error: {
        code: 'INVALID_MOUNT',
        message: `Service "${name}" has invalid "mount" config. Specify at least one of "mount.path" or "mount.subdomain".`,
        serviceName: name,
      },
    };
  }

  return {
    routing: {
      routePrefix: mountPath,
      subdomain: mountSubdomain,
      routePrefixConfigured: typeof mountPath === 'string',
    },
  };
}
