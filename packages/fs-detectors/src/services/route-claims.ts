import { INTERNAL_SERVICE_PREFIX } from '@vercel/build-utils';
import type {
  ServiceRoutingConfigEntry,
  ServiceRoutingEntry,
} from '@vercel/build-utils';
import { normalizeRoutePrefix } from '@vercel/routing-utils';
import type { ServiceDetectionError } from './types';

function toSegments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

/**
 * A literal path segment is one with no path-to-regexp params, wildcards,
 * groups, or regex metacharacters.
 */
function isLiteralSegment(segment: string): boolean {
  return !/[:*?(){}\\]/.test(segment);
}

/**
 * A terminal catch-all/repeating param such as `:path*` or `:rest+`. These are
 * the only dynamic segments allowed, and only in the final position.
 */
function isTerminalCatchall(segment: string): boolean {
  return /^:[A-Za-z_]\w*[*+]$/.test(segment);
}

export interface NormalizedServiceRouting {
  /** One resolved mount per owned path prefix. */
  entries: ServiceRoutingEntry[];
  /** Subdomain from a `host` routing entry, if present. */
  subdomain?: string;
}

/**
 * Extract the literal owned prefix from a public path pattern.
 *
 * A path may be a literal prefix (e.g. `/api`) optionally followed by a single
 * trailing catch-all (`/api/:path*`). Interior dynamic params (e.g.
 * `/api/users/:id/view/:path*`) are rejected for now as they require more complex service route ownership.
 */
export function extractRoutePrefix(
  path: string
): { prefix: string } | { error: string } {
  const segments = toSegments(path);
  if (
    segments.length > 0 &&
    isTerminalCatchall(segments[segments.length - 1])
  ) {
    segments.pop();
  }
  const dynamic = segments.find(segment => !isLiteralSegment(segment));
  if (dynamic) {
    return {
      error: `path "${path}" has a dynamic segment "${dynamic}" outside the trailing catch-all, which is not supported`,
    };
  }
  return { prefix: normalizeRoutePrefix(`/${segments.join('/')}`) };
}

/**
 * Derive the static prefix that `forward` strips from `path`.
 *
 * Valid only when `forward` equals `path` with a leading run of *literal*
 * segments removed; the remaining segments (including param names and order)
 * must be preserved exactly. Returns `stripPrefix: undefined` for identity
 * (no `forward`, or a `forward` equal to `path`).
 */
export function deriveStripPrefix(
  path: string,
  forward: string | undefined
): { stripPrefix?: string } | { error: string } {
  if (forward === undefined) {
    return { stripPrefix: undefined };
  }
  const src = toSegments(path);
  const fwd = toSegments(forward);
  if (fwd.length > src.length) {
    return {
      error: `forward.path "${forward}" cannot be longer than path "${path}"`,
    };
  }
  const removed = src.length - fwd.length;
  for (let i = 0; i < removed; i++) {
    if (!isLiteralSegment(src[i])) {
      return {
        error: `forward.path cannot strip dynamic segment "${src[i]}" from "${path}"`,
      };
    }
  }
  for (let i = 0; i < fwd.length; i++) {
    if (src[removed + i] !== fwd[i]) {
      return {
        error: `forward.path "${forward}" must equal path "${path}" with a static prefix removed`,
      };
    }
  }
  if (removed === 0) {
    return { stripPrefix: undefined };
  }
  return {
    stripPrefix: normalizeRoutePrefix(`/${src.slice(0, removed).join('/')}`),
  };
}

/**
 * The service-relative namespace a mount yields — the path the service sees.
 * Used to enforce that multiple mounts normalize to the same namespace.
 */
function namespaceOf(path: string, forward: string | undefined): string {
  return normalizeRoutePrefix(forward ?? path);
}

function isReservedPrefix(prefix: string): boolean {
  return (
    prefix === INTERNAL_SERVICE_PREFIX ||
    prefix.startsWith(`${INTERNAL_SERVICE_PREFIX}/`)
  );
}

/**
 * Normalize and validate a service's `routing` config into resolved entries
 * plus an optional subdomain. Enforces the supported subset:
 * - only static prefixes (no interior dynamic params; no arbitrary forwards);
 * - `forward` may only strip a leading literal prefix;
 * - multiple path entries must all resolve to the same service-relative
 *   namespace (so the service URL can be constructed from any of them);
 * - at most one host entry.
 */
export function normalizeServiceRouting(
  name: string,
  routing: ServiceRoutingConfigEntry[]
): { routing?: NormalizedServiceRouting; error?: ServiceDetectionError } {
  const entries: ServiceRoutingEntry[] = [];
  const namespaces = new Set<string>();
  let subdomain: string | undefined;

  // Validate a single public path against an optional shared `forward`, and
  // record the resolved mount. Returns an error or `null` on success.
  const pushPath = (
    path: string,
    forward: string | undefined
  ): ServiceDetectionError | null => {
    if (typeof path !== 'string' || !path.startsWith('/')) {
      return {
        code: 'INVALID_ROUTING',
        message: `Service "${name}" has an invalid routing path "${String(path)}". Paths must be absolute (start with "/").`,
        serviceName: name,
      };
    }

    const prefixResult = extractRoutePrefix(path);
    if ('error' in prefixResult) {
      return {
        code: 'UNSUPPORTED_ROUTING_PATH',
        message: `Service "${name}": ${prefixResult.error}.`,
        serviceName: name,
      };
    }

    if (isReservedPrefix(prefixResult.prefix)) {
      return {
        code: 'RESERVED_ROUTE_PREFIX',
        message: `Service "${name}" cannot use routing path "${path}". The "${INTERNAL_SERVICE_PREFIX}" prefix is reserved for internal services routing.`,
        serviceName: name,
      };
    }

    const stripResult = deriveStripPrefix(path, forward);
    if ('error' in stripResult) {
      return {
        code: 'UNSUPPORTED_FORWARD',
        message: `Service "${name}": ${stripResult.error}.`,
        serviceName: name,
      };
    }

    namespaces.add(namespaceOf(path, forward));
    entries.push({
      prefix: prefixResult.prefix,
      stripPrefix: stripResult.stripPrefix,
    });
    return null;
  };

  for (const entry of routing) {
    if (typeof entry === 'string') {
      const error = pushPath(entry, undefined);
      if (error) return { error };
      continue;
    }

    if (entry === null || typeof entry !== 'object') {
      return {
        error: {
          code: 'INVALID_ROUTING',
          message: `Service "${name}" has an invalid routing entry. Use a path string, an object with "paths", or an object with "host".`,
          serviceName: name,
        },
      };
    }

    if ('host' in entry) {
      if (subdomain !== undefined) {
        return {
          error: {
            code: 'INVALID_ROUTING',
            message: `Service "${name}" has more than one host routing entry. Only one subdomain is supported.`,
            serviceName: name,
          },
        };
      }
      subdomain = entry.host.subdomain;
      continue;
    }

    const { paths } = entry;
    if (!Array.isArray(paths) || paths.length === 0) {
      return {
        error: {
          code: 'INVALID_ROUTING',
          message: `Service "${name}" has a routing entry with no "paths". Provide a non-empty array of path patterns.`,
          serviceName: name,
        },
      };
    }
    const forward = entry.forward?.path;
    for (const path of paths) {
      const error = pushPath(path, forward);
      if (error) return { error };
    }
  }

  if (entries.length === 0 && subdomain === undefined) {
    return {
      error: {
        code: 'MISSING_ROUTE_PREFIX',
        message: `Service "${name}" has a "routing" config with no usable path or host entries.`,
        serviceName: name,
      },
    };
  }

  if (entries.length > 1 && namespaces.size > 1) {
    return {
      error: {
        code: 'INCOHERENT_SERVICE_NAMESPACE',
        message: `Service "${name}" has multiple routes that resolve to different paths the service would receive. Multiple routes are only allowed when each "forward" normalizes them to the same path.`,
        serviceName: name,
      },
    };
  }

  return { routing: { entries, subdomain } };
}
