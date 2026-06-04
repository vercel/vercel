/**
 * Scans `process.env` for env vars matching `<PREFIX>_AWS_RESOURCE_ARN` (or
 * the bare `AWS_RESOURCE_ARN`, which the Marketplace injects for the first
 * connected resource) whose value starts with the given ARN service segment
 * (e.g. `arn:aws:dsql:`).
 *
 * Each Vercel Marketplace storage integration is linked to a project under
 * a prefix. The first connection has no prefix and uses bare env vars
 * (`AWS_RESOURCE_ARN`, `PGHOST`, …); additional connections are prefixed
 * (`STORAGE2_AWS_RESOURCE_ARN`, `STORAGE2_PGHOST`, …). Since the integration
 * the user wants is identified by its resource ARN — and the ARN contains
 * the AWS service name — we can derive the prefix from any matching
 * `_AWS_RESOURCE_ARN` (or bare `AWS_RESOURCE_ARN`) in env.
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
  /** ARN service segment, e.g. `arn:aws:dsql:`. */
  arnPrefix: string;
}): string {
  const matches: Array<{ prefix: string; arn: string }> = [];
  for (const [key, value] of Object.entries(process.env)) {
    if (!value || !value.startsWith(opts.arnPrefix)) continue;
    let prefix: string;
    if (key === 'AWS_RESOURCE_ARN') {
      prefix = '';
    } else if (key.endsWith('_AWS_RESOURCE_ARN')) {
      prefix = key.slice(0, -'_AWS_RESOURCE_ARN'.length);
    } else {
      continue;
    }
    matches.push({ prefix, arn: value });
  }

  const defaultMatch = matches.find(m => m.prefix === '');
  if (defaultMatch) return defaultMatch.prefix;

  if (matches.length === 1) {
    return matches[0].prefix;
  }

  if (matches.length === 0) {
    throw new Error(
      `${opts.factory}: no ${opts.service} resource is connected to this project. ` +
        `Connect one from the Vercel Marketplace, or pass { prefix } / explicit fields.`
    );
  }

  const list = matches.map(m => `  - ${m.prefix}  →  ${m.arn}`).join('\n');
  throw new Error(
    `${opts.factory}: found multiple ${opts.service} resources connected to this project:\n\n` +
      `${list}\n\n` +
      `Pick one by passing { prefix }:\n` +
      `  ${opts.factory}({ prefix: '${matches[0].prefix}' })`
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
