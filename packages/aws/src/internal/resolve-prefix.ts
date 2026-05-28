/**
 * Scans `process.env` for env vars matching `<PREFIX>_AWS_RESOURCE_ARN` whose
 * value starts with the given ARN service segment (e.g. `arn:aws:dsql:`).
 *
 * Each Vercel Marketplace storage integration is linked to a project with a
 * user-chosen prefix. Vercel then injects every config value under that
 * prefix (e.g. `STORAGE_PGHOST`, `MY_DB_AWS_REGION`). Since the integration
 * the user wants is identified by its resource ARN — and the ARN contains
 * the AWS service name — we can derive the prefix from any matching
 * `_AWS_RESOURCE_ARN` in env.
 *
 * Returns the matched prefix when exactly one resource of the given service
 * is connected. Throws a descriptive error otherwise.
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
    if (!key.endsWith('_AWS_RESOURCE_ARN')) continue;
    if (!value || !value.startsWith(opts.arnPrefix)) continue;
    const prefix = key.slice(0, -'_AWS_RESOURCE_ARN'.length);
    matches.push({ prefix, arn: value });
  }

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
 * Reads a required prefixed env var, throwing a helpful error if missing.
 */
export function requireEnv(
  factory: string,
  prefix: string,
  suffix: string
): string {
  const key = `${prefix}_${suffix}`;
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `${factory}: missing required environment variable ${key}. ` +
        `Re-link the Marketplace resource, or pass explicit options.`
    );
  }
  return value;
}
