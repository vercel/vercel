/**
 * Vercel Functions have historically had a hard timeout limit of 900 seconds
 * (15 minutes), which has long doubled as the client-side upper bound for
 * `maxDuration` in `vercel.json` and zero-config function detection.
 *
 * The authoritative limit is enforced by server-side validation at deploy time.
 * The CLI and `@vercel/build-utils` cannot know that limit at build time, so
 * this client-side bound is intentionally coarse — it exists only to give fast
 * local feedback on obviously-invalid values.
 */
export const DEFAULT_MAX_DURATION_LIMIT = 1800;

/**
 * Internal env var used to skip the client-side `maxDuration` upper-bound check.
 * When set to `'1'`, the client-side maximum ({@link DEFAULT_MAX_DURATION_LIMIT})
 * is not applied and validation defers to the server, so the limit can be
 * adjusted centrally without requiring users to upgrade their CLI. The lower
 * bound and integer checks are always enforced regardless of this flag.
 */
export const SKIP_MAX_DURATION_LIMIT_ENV = 'VERCEL_CLI_SKIP_MAX_DURATION_LIMIT';

// TODO: Once `VERCEL_CLI_SKIP_MAX_DURATION_LIMIT` is fully rolled out and the
// server-side limit is authoritative for everyone, drop the client-side upper
// bound entirely: remove this env var, `getMaxDurationLimit`, the `maximum`
// branch of `getMaxDurationSchema`, and the lazy per-limit validator machinery
// in the CLI (`packages/cli/src/util/validate-config.ts`). The `vercel.json`
// schema can then be compiled once again with no `maxDuration` maximum, and the
// lower-bound/integer checks become the only client-side validation.

/**
 * Returns the client-side upper bound for `maxDuration` in seconds, or
 * `undefined` when the bound is skipped via {@link SKIP_MAX_DURATION_LIMIT_ENV}
 * (server-side validation governs the real limit in that case). The lower bound
 * and integer checks are always enforced by callers regardless of this flag.
 */
export function getMaxDurationLimit(): number | undefined {
  if (process.env[SKIP_MAX_DURATION_LIMIT_ENV] === '1') {
    return undefined;
  }
  return DEFAULT_MAX_DURATION_LIMIT;
}

/**
 * Returns the JSON Schema fragment used to validate a function's `maxDuration`
 * in `vercel.json`. When the client-side upper bound is active the integer
 * branch includes a `maximum`; when skipped via
 * {@link SKIP_MAX_DURATION_LIMIT_ENV} the `maximum` is omitted so any positive
 * integer passes schema validation and the server enforces the limit.
 */
export function getMaxDurationSchema() {
  const limit = getMaxDurationLimit();
  return {
    oneOf: [
      {
        type: 'integer',
        minimum: 1,
        ...(limit !== undefined ? { maximum: limit } : {}),
      },
      { type: 'string', enum: ['max'] },
    ],
  };
}
