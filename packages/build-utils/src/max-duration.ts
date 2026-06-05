/**
 * Vercel Functions have historically had a hard timeout limit of 900 seconds
 * (15 minutes), which has long doubled as the client-side upper bound for
 * `maxDuration` in `vercel.json` and zero-config function detection.
 *
 * The authoritative limit is plan-aware and enforced server-side (vercel/api):
 * it varies by billing plan and compute mode (e.g. Fluid, Active CPU). The CLI
 * and `@vercel/build-utils` cannot know any of that at build time, so this
 * client-side bound is intentionally coarse — it exists only to give fast local
 * feedback on obviously-invalid values.
 */
export const DEFAULT_MAX_DURATION_LIMIT = 900;

/**
 * Internal env var used to opt out of the client-side `maxDuration` upper bound.
 * When set to `'1'`, the CLI / build-utils stop enforcing the coarse
 * {@link DEFAULT_MAX_DURATION_LIMIT} and defer entirely to the plan-aware
 * server-side validation. This lets the platform raise the limit centrally
 * (typically by setting the variable in the build environment) without
 * requiring users to upgrade their CLI.
 */
export const ALLOW_EXTENDED_MAX_DURATION_ENV =
  'VERCEL_ALLOW_EXTENDED_MAX_DURATION';

/**
 * Returns the client-side upper bound for `maxDuration` in seconds, or
 * `undefined` when the bound is disabled via
 * {@link ALLOW_EXTENDED_MAX_DURATION_ENV} (server-side validation governs the
 * real limit in that case). The lower bound and integer checks are always
 * enforced by callers regardless of this flag.
 */
export function getMaxDurationLimit(): number | undefined {
  if (process.env[ALLOW_EXTENDED_MAX_DURATION_ENV] === '1') {
    return undefined;
  }
  return DEFAULT_MAX_DURATION_LIMIT;
}

/**
 * Returns the JSON Schema fragment used to validate a function's `maxDuration`
 * in `vercel.json`. When the client-side upper bound is active the integer
 * branch includes a `maximum`; when disabled via
 * {@link ALLOW_EXTENDED_MAX_DURATION_ENV} the `maximum` is omitted so any
 * positive integer passes schema validation and the server enforces the limit.
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
