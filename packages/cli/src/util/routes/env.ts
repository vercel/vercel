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
import type { SrcSyntax } from './types';

/**
 * Extract uppercase environment variable names referenced via `$VAR` or `${VAR}`.
 * Only matches uppercase names ([A-Z_][A-Z0-9_]*) to avoid confusing
 * low-level named-regex captures such as `$path` with environment variables.
 */
export function extractEnvVarNames(value: string): string[] {
  const names = new Set<string>();
  for (const m of value.matchAll(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g)) {
    names.add(m[1]);
  }
  return Array.from(names);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function referencesEnvVar(value: string, name: string): boolean {
  const escapedName = escapeRegex(name);
  return new RegExp(
    `\\$(?:\\{${escapedName}\\}|${escapedName}(?![A-Za-z0-9_]))`
  ).test(value);
}

function referencesBracedEnvVar(value: string, name: string): boolean {
  return new RegExp(`\\$\\{${escapeRegex(name)}\\}`).test(value);
}

function collectReferencedEnvVars(
  values: string[],
  explicitEnv: string[] = [],
  excludedNames: Set<string> = new Set()
): string[] {
  const names = new Set(
    explicitEnv.filter(name =>
      values.some(value => referencesEnvVar(value, name))
    )
  );

  for (const value of values) {
    for (const name of extractEnvVarNames(value)) {
      if (
        !excludedNames.has(name) ||
        names.has(name) ||
        referencesBracedEnvVar(value, name)
      ) {
        names.add(name);
      }
    }
  }

  return Array.from(names);
}

function collectNamedRegexCaptures(source: string): Set<string> {
  return new Set(
    Array.from(
      source.matchAll(/\(\?<([a-zA-Z][a-zA-Z0-9_]*)>/g),
      match => match[1]
    )
  );
}

/**
 * Populates env fields on a route object and its transforms.
 * Scans dest, headers values, and transform args for $VAR references.
 *
 * - route.env: populated from dest + headers values
 * - transform.env: populated from each transform's args
 */
export function populateRouteEnv(
  route: {
    src?: string;
    dest?: string;
    headers?: Record<string, string>;
    transforms?: Array<{ args?: string | string[]; env?: string[] }>;
    env?: string[];
  },
  srcSyntax: SrcSyntax = 'regex'
): void {
  // For regex routes, do not mistake named captures for env vars:
  // - `(?<TEAM>...)` with `/$TEAM` uses the captured `TEAM` value.
  // - `/${TEAM}` explicitly uses the `TEAM` environment variable.
  // Keep any env names already supplied by the user. Path-to-regexp captures
  // use `:team`, so `$TEAM` means an environment variable in those routes.
  const excludedNames =
    srcSyntax === 'regex' && route.src
      ? collectNamedRegexCaptures(route.src)
      : new Set<string>();

  // Route-level env from dest and header values
  const routeValues = [
    ...(route.dest ? [route.dest] : []),
    ...Object.values(route.headers || {}),
  ];
  const routeEnv = collectReferencedEnvVars(
    routeValues,
    route.env,
    excludedNames
  );

  // Always set route.env — clear stale values when editing removes $VAR references
  route.env = routeEnv.length > 0 ? routeEnv : undefined;

  // Per-transform env from args
  if (route.transforms) {
    for (const transform of route.transforms) {
      const args = transform.args
        ? Array.isArray(transform.args)
          ? transform.args
          : [transform.args]
        : [];
      const names = collectReferencedEnvVars(
        args,
        transform.env,
        excludedNames
      );
      // Always set — clear stale values when args no longer reference env vars
      transform.env = names.length > 0 ? names : undefined;
    }
  }
}
