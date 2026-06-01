import type { VercelConfig } from './dev/types';

/**
 * Fields declared in vercel.json that are validated and consumed by the CLI
 * but are not yet part of the deployment API schema.
 */
const CLI_ONLY_VERCEL_CONFIG_FIELDS = [
  'experimentalEnvironmentVariables',
] as const;

export function stripCliOnlyVercelConfigFields<T extends VercelConfig>(
  config: T
): T {
  const stripped = { ...config };

  for (const field of CLI_ONLY_VERCEL_CONFIG_FIELDS) {
    delete stripped[field];
  }

  return stripped;
}
