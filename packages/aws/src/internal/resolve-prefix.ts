/**
 * Scans `process.env` for `<PREFIX>_AWS_RESOURCE_TYPE` (or the bare
 * `AWS_RESOURCE_TYPE`, which the Marketplace injects for the first connected
 * resource) equal to the given service type (e.g. `dsql`).
 *
 * Each Vercel Marketplace storage integration is linked to a project under
 * a prefix. The first connection has no prefix and uses bare env vars
 * (`AWS_RESOURCE_TYPE`, `PGHOST`, …); additional connections are prefixed
 * (`STORAGE2_AWS_RESOURCE_TYPE`, `STORAGE2_PGHOST`, …). The Marketplace tags
 * each resource with its service type, so we find the resource by matching
 * that type and derive the prefix from the matching var's name.
 *
 * The returned prefix is an empty string for the unprefixed default
 * connection, or the captured prefix otherwise.
 *
 * When a default and one or more prefixed resources of the same service are
 * connected, the default wins — matching the Marketplace convention that the
 * first connection is the implicit "primary." Callers can still request a
 * specific prefixed resource explicitly via `{ prefix }`.
 *
 * Throws when no resource of the given service is connected, or when
 * multiple prefixed resources are connected without a default to disambiguate.
 */
export function resolvePrefix(opts: {
  /** Factory name, used in error messages. */
  factory: string;
  /** Human-readable service name, used in error messages. */
  service: string;
  /** Marketplace resource type, e.g. `dsql`, `rds`, `dynamodb`, `opensearch`. */
  resourceType: string;
}): string {
  const prefixes: string[] = [];
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== opts.resourceType) continue;
    if (key === 'AWS_RESOURCE_TYPE') {
      prefixes.push('');
    } else if (key.endsWith('_AWS_RESOURCE_TYPE')) {
      prefixes.push(key.slice(0, -'_AWS_RESOURCE_TYPE'.length));
    }
  }

  if (prefixes.includes('')) return '';
  if (prefixes.length === 1) return prefixes[0];

  if (prefixes.length === 0) {
    throw new Error(
      `${opts.factory}: no ${opts.service} resource is connected to this project. ` +
        `Connect one from the Vercel Marketplace, or pass { prefix } / explicit fields.`
    );
  }

  const list = prefixes.map(p => `  - ${p}`).join('\n');
  throw new Error(
    `${opts.factory}: found multiple ${opts.service} resources connected to this project:\n\n` +
      `${list}\n\n` +
      `Pick one by passing { prefix }:\n` +
      `  ${opts.factory}({ prefix: '${prefixes[0]}' })`
  );
}

/**
 * Joins a prefix and suffix into an env var key. The unprefixed default
 * connection uses bare keys (no leading underscore).
 */
export function envKey(prefix: string, suffix: string): string {
  return prefix === '' ? suffix : `${prefix}_${suffix}`;
}

/**
 * Reads a required prefixed env var, throwing a helpful error if missing.
 */
export function requireEnv(
  factory: string,
  prefix: string,
  suffix: string
): string {
  const key = envKey(prefix, suffix);
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `${factory}: missing required environment variable ${key}. ` +
        `Re-link the Marketplace resource, or pass explicit options.`
    );
  }
  return value;
}
