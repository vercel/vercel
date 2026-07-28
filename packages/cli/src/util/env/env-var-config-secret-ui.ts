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
