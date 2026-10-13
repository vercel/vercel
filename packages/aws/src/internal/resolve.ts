/**
 * Describes how to find one kind of Marketplace resource in `process.env`.
 */
export interface ResourceSpec {
  /** Factory name, used in error messages. */
  factory: string;
  /** Human-readable service name, used in error messages. */
  service: string;
  /**
   * An env var only this kind of resource injects (e.g. `S3_BUCKET_NAME`),
   * without its prefix.
   */
  marker: string;
  /**
   * Narrows the candidates when two kinds of resource inject the same marker
   * (Aurora DSQL and Aurora PostgreSQL both inject `PGHOST`).
   */
  accepts?: (prefix: string) => boolean;
  /**
   * Checks an explicit `{ prefix }`, which skips `accepts`. Returns why the
   * resource under that prefix is the wrong kind for this factory, or
   * `undefined` when it isn't known to be.
   */
  rejects?: (prefix: string) => string | undefined;
}

/**
 * Value the Marketplace injects for env vars whose resource is still being
 * created.
 */
const PROVISIONING = 'provisioning';

/**
 * Joins a prefix and suffix into an env var key. The unprefixed default
 * connection uses bare keys (no leading underscore).
 */
export function envKey(prefix: string, suffix: string): string {
  return prefix === '' ? suffix : `${prefix}_${suffix}`;
}

/**
 * Returns the prefix of every connected resource matching `spec`.
 *
 * Each Vercel Marketplace AWS resource is linked to a project under a prefix.
 * The first connection has no prefix and uses bare env vars (`AWS_ROLE_ARN`,
 * `S3_BUCKET_NAME`, …); additional connections are prefixed
 * (`STORAGE2_AWS_ROLE_ARN`, `STORAGE2_S3_BUCKET_NAME`, …).
 *
 * A prefix counts as a match when both `<prefix>_<marker>` and
 * `<prefix>_AWS_ROLE_ARN` are set. Because every service injects a distinct
 * marker, resources of different services never collide — e.g. an S3 bucket,
 * an S3 vector bucket, and an S3 table bucket linked to the same project are
 * each found only by their own factory. Requiring the role ARN as well keeps
 * unrelated env vars (a local `PGHOST`, an app-defined `BACKUP_S3_BUCKET_NAME`)
 * from being mistaken for a Marketplace resource.
 *
 * The one case this can't catch is an app-defined marker sharing a prefix with
 * a different Marketplace resource — most likely an app's own unprefixed
 * `S3_BUCKET_NAME` next to an unprefixed AWS resource of another service. The
 * shared `AWS_ROLE_ARN` then belongs to that other resource. We don't guard
 * against it: the Marketplace never connects two resources under one prefix
 * (conflicting env var names are rejected), so a guard would mostly break the
 * factory that is correct. Each role is scoped to its own resource, so the
 * mismatched factory fails with `AccessDenied` rather than reaching anything
 * else.
 */
export function findPrefixes(spec: ResourceSpec): string[] {
  const markerSuffix = `_${spec.marker}`;
  const prefixes: string[] = [];
  for (const key of Object.keys(process.env)) {
    let prefix: string;
    if (key === spec.marker) {
      prefix = '';
    } else if (key.endsWith(markerSuffix)) {
      prefix = key.slice(0, -markerSuffix.length);
    } else {
      continue;
    }
    if (!process.env[key] || !process.env[envKey(prefix, 'AWS_ROLE_ARN')]) {
      continue;
    }
    if (spec.accepts && !spec.accepts(prefix)) continue;
    prefixes.push(prefix);
  }
  return prefixes;
}

/**
 * Picks the prefix of the connected resource matching `spec`.
 *
 * When the unprefixed default connection matches, it wins — matching the
 * Marketplace convention that the first connection is the implicit "primary."
 * Callers can still request a specific prefixed resource via `{ prefix }`.
 *
 * Throws when no matching resource is connected, or when multiple prefixed
 * resources match without a default to disambiguate.
 */
export function resolvePrefix(spec: ResourceSpec): string {
  const prefixes = findPrefixes(spec);

  if (prefixes.includes('')) return '';
  if (prefixes.length === 1) return prefixes[0];

  if (prefixes.length === 0) {
    throw new Error(
      `${spec.factory}: no ${spec.service} resource is connected to this project ` +
        `(looked for ${spec.marker} or <PREFIX>_${spec.marker} alongside a matching AWS_ROLE_ARN). ` +
        `Connect one from the Vercel Marketplace, or pass { prefix } / explicit fields.`
    );
  }

  const list = prefixes
    .sort()
    .map(p => `  - ${p}`)
    .join('\n');
  throw new Error(
    `${spec.factory}: found multiple ${spec.service} resources connected to this project:\n\n` +
      `${list}\n\n` +
      `Pick one by passing { prefix }:\n` +
      `  ${spec.factory}({ prefix: '${prefixes[0]}' })`
  );
}

function describePrefix(prefix: string): string {
  return prefix === '' ? 'without a prefix' : `under prefix "${prefix}"`;
}

/**
 * The error for an env var still holding a provisioning placeholder.
 */
export function provisioningError(
  spec: ResourceSpec,
  key: string,
  value: string
): Error {
  return new Error(
    `${spec.factory}: ${key} is "${value}" — the ${spec.service} resource ` +
      `has not finished provisioning yet. Redeploy once it is ready.`
  );
}

/**
 * Reads env vars for one resource. The prefix is resolved lazily, so a caller
 * that passes every field explicitly never touches the environment.
 */
export function resourceEnv(spec: ResourceSpec, prefix?: string) {
  if (prefix !== undefined) {
    const reason = spec.rejects?.(prefix);
    if (reason) {
      throw new Error(
        `${spec.factory}: the resource linked ${describePrefix(prefix)} ${reason}.`
      );
    }
  }

  let resolved = prefix;
  const getPrefix = () => (resolved ??= resolvePrefix(spec));

  return {
    /**
     * Reads a required env var, resolving the prefix if needed. Throws if the
     * var is missing or the resource is still provisioning.
     */
    require(suffix: string): string {
      const key = envKey(getPrefix(), suffix);
      const value = process.env[key];
      if (!value) {
        throw new Error(
          `${spec.factory}: missing required environment variable ${key}. ` +
            `Re-link the Marketplace resource, or pass explicit options.`
        );
      }
      if (value === PROVISIONING) throw provisioningError(spec, key, value);
      return value;
    },
    /**
     * Reads an optional env var. Only consults the environment when the prefix
     * is already known (passed in, or resolved by an earlier `require`).
     */
    optional(suffix: string): string | undefined {
      if (resolved === undefined) return undefined;
      const value = process.env[envKey(resolved, suffix)];
      return value && value !== PROVISIONING ? value : undefined;
    },
  };
}
