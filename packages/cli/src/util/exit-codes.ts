/**
 * Categorized exit codes for agent-first CLI output.
 *
 * Agents can switch on exit codes to decide how to recover
 * (e.g. re-authenticate on AUTH_ERROR, fix flags on VALIDATION).
 */
export const EXIT_CODE = {
  SUCCESS: 0, // Operation completed
  API_ERROR: 1, // Vercel API returned an error
  AUTH_ERROR: 2, // Authentication/authorization failed
  VALIDATION: 3, // Input validation failed (bad flags, path traversal, etc.)
  CONFIG_ERROR: 4, // Missing config, not linked, bad vercel.json
  INTERNAL: 5, // Unexpected internal error
} as const;

export type ExitCode = (typeof EXIT_CODE)[keyof typeof EXIT_CODE];
