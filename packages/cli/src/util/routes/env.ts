/**
 * Environment variable extraction for route payloads.
 *
 * The Vercel proxy only expands environment variables that are explicitly
 * listed in the route's `env` array. This module scans user-provided strings
 * (destinations, header values, transform args) for $VAR / ${VAR} patterns
 * and populates the `env` field before submitting to the API.
 *
 * @see https://github.com/vercel/vercel/blob/main/packages/config/src/router.ts — extractEnvVars
 */

/**
 * Extract uppercase environment variable names referenced via `$VAR` or `${VAR}`.
 * Only matches uppercase names ([A-Z_][A-Z0-9_]*) to avoid confusing
 * path parameters (e.g., $path from :path*) with environment variables.
 */
export function extractEnvVarNames(value: string): string[] {
  const names = new Set<string>();
  for (const m of value.matchAll(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g)) {
    names.add(m[1]);
  }
  return Array.from(names);
}

/**
 * Populates env fields on a route object and its transforms.
 * Scans dest, headers values, and transform args for $VAR references.
 *
 * - route.env: populated from dest + headers values
 * - transform.env: populated from each transform's args
 */
export function populateRouteEnv(route: {
  dest?: string;
  headers?: Record<string, string>;
  transforms?: Array<{ args?: string | string[]; env?: string[] }>;
  env?: string[];
}): void {
  // Route-level env from dest and header values
  const routeEnv = new Set<string>();

  if (route.dest) {
    for (const name of extractEnvVarNames(route.dest)) {
      routeEnv.add(name);
    }
  }

  if (route.headers) {
    for (const value of Object.values(route.headers)) {
      for (const name of extractEnvVarNames(value)) {
        routeEnv.add(name);
      }
    }
  }

  // Always set route.env — clear stale values when editing removes $VAR references
  route.env = routeEnv.size > 0 ? Array.from(routeEnv) : undefined;

  // Per-transform env from args
  if (route.transforms) {
    for (const transform of route.transforms) {
      if (transform.args) {
        const argsStr = Array.isArray(transform.args)
          ? transform.args.join(' ')
          : transform.args;
        const names = extractEnvVarNames(argsStr);
        // Always set — clear stale values when args no longer reference env vars
        transform.env = names.length > 0 ? names : undefined;
      }
    }
  }
}
