import type { ProjectEnvType } from '@vercel-internals/types';

export type EnvVariableVisibility = 'config' | 'secret';

/**
 * Opt-in CLI support for the config/secret env var model (dashboard flag:
 * `env-var-config-secret-ui`). When enabled, the CLI skips legacy Sensitive
 * Environment Variables Policy coercion and allows secrets in Development.
 */
export function isEnvVarConfigSecretUiEnabled(): boolean {
  const raw = process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
  return (
    raw === '1' || raw?.toLowerCase() === 'true' || raw?.toLowerCase() === 'on'
  );
}

export function shouldEnforceSensitiveEnvVarPolicy(policyOn: boolean): boolean {
  return policyOn && !isEnvVarConfigSecretUiEnabled();
}

/** Maps legacy `type` to config/secret visibility for API requests. */
export function visibilityFromEnvType(
  type: ProjectEnvType
): EnvVariableVisibility | undefined {
  if (type === 'sensitive') {
    return 'secret';
  }
  if (type === 'plain' || type === 'encrypted') {
    return 'config';
  }
  return undefined;
}
