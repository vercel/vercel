/**
 * System environments a deployment can run in. A grant lists these by name; the
 * API matches them against the token's `environment` claim.
 */
export const SYSTEM_ENVIRONMENTS = [
  'production',
  'preview',
  'development',
] as const;

/**
 * Custom environment IDs are prefixed `env_`. Unlike system environments, a
 * grant references a custom environment by this stable ID rather than its
 * (mutable) name, because the API matches it against the token's
 * `custom_environment_id` claim.
 */
const CUSTOM_ENVIRONMENT_ID_PREFIX = 'env_';

function isSystemEnvironment(value: string): boolean {
  return (SYSTEM_ENVIRONMENTS as readonly string[]).includes(value);
}

function isCustomEnvironmentId(value: string): boolean {
  return (
    value.startsWith(CUSTOM_ENVIRONMENT_ID_PREFIX) &&
    value.length > CUSTOM_ENVIRONMENT_ID_PREFIX.length
  );
}

/**
 * Returns the entries that are neither a system environment nor a custom
 * environment ID. The API rejects such values, so we surface them locally with
 * guidance instead of passing through an opaque 400.
 */
export function findInvalidEnvironments(environments: string[]): string[] {
  return environments.filter(
    value => !isSystemEnvironment(value) && !isCustomEnvironmentId(value)
  );
}

/** A user-facing message naming the invalid entries and the accepted formats. */
export function invalidEnvironmentsMessage(invalid: string[]): string {
  const label = invalid.length === 1 ? 'environment' : 'environments';
  return (
    `Invalid ${label}: ${invalid.join(', ')}. ` +
    `Pass a system environment (${SYSTEM_ENVIRONMENTS.join(', ')}) or a custom ` +
    `environment ID (starts with "${CUSTOM_ENVIRONMENT_ID_PREFIX}"). Custom ` +
    `environments are granted by ID, not name.`
  );
}
