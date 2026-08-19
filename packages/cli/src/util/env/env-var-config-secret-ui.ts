import type { ProjectEnvType } from '@vercel-internals/types';
import { getApiPublicPrefix } from './validate-env';

export type EnvVariableVisibility = 'config' | 'secret';

/**
 * Opt-in CLI support for the config/secret env var model (dashboard flag:
 * `env-var-config-secret-ui`). When enabled, the CLI skips legacy Sensitive
 * Environment Variables Policy coercion. The API allows Secret variables in
 * Development while this model is enabled.
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

/** Human-readable type for CLI output. */
export function formatVisibilityLabel(
  visibility: EnvVariableVisibility | undefined,
  type: ProjectEnvType
): string | undefined {
  const resolved = visibility ?? visibilityFromEnvType(type);
  if (resolved === 'config') {
    return 'Config';
  }
  if (resolved === 'secret') {
    return 'Secret';
  }
  return undefined;
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

/**
 * Returns a client-side error when a public-prefixed key cannot use secret
 * visibility (matches API `getConfigSecretValidationError` rules).
 */
export function getPublicPrefixSecretVisibilityError(
  key: string,
  options: {
    visibility?: EnvVariableVisibility;
    type: ProjectEnvType;
    context?: 'add' | 'update';
  }
): string | null {
  const publicPrefix = getApiPublicPrefix(key);
  if (!publicPrefix) {
    return null;
  }

  const wouldBeSecret =
    options.visibility === 'secret' || options.type === 'sensitive';
  if (!wouldBeSecret) {
    return null;
  }

  const privateKey = key.slice(publicPrefix.length);
  if (options.context === 'update') {
    return `\`${publicPrefix}\` exposes this value to anyone visiting your site, so \`${key}\` cannot be a Secret. To keep it private, add \`${privateKey}\` as a Secret, then remove \`${key}\`. If the value is safe to expose, keep it as Config.`;
  }
  return `\`${publicPrefix}\` exposes this value to anyone visiting your site, so \`${key}\` cannot be a Secret. To keep it private, rename the variable to \`${privateKey}\` and keep the Secret type. If the value is safe to expose, use \`--type config\`.`;
}

export interface ResolveEnvVarVisibilityOptions {
  configSecretUiEnabled: boolean;
  explicitVisibility?: string;
  type: ProjectEnvType;
  key: string;
  envTargets: string[];
  teamSensitivePolicyOn: boolean;
}

export interface ResolveEnvVarVisibilityResult {
  visibility?: EnvVariableVisibility;
  error?: string;
}

/**
 * Resolves `visibility` for API requests. Uses `--type` when set;
 * otherwise infers from `type` unless that would fail for public-prefixed keys.
 */
export function resolveEnvVarVisibility(
  options: ResolveEnvVarVisibilityOptions
): ResolveEnvVarVisibilityResult {
  if (!options.configSecretUiEnabled) {
    return {};
  }

  if (options.explicitVisibility !== undefined) {
    if (
      options.explicitVisibility !== 'config' &&
      options.explicitVisibility !== 'secret'
    ) {
      return {
        error:
          options.explicitVisibility === 'sensitive'
            ? 'The `--type` flag accepts `config` or `secret`. Use `--type secret` or the legacy `--sensitive` flag.'
            : options.explicitVisibility === 'plain' ||
                options.explicitVisibility === 'encrypted'
              ? 'The `--type` flag accepts `config` or `secret`. Use `--type config` for readable values.'
              : 'The `--type` flag must be either `config` or `secret`.',
      };
    }

    const publicPrefixError = getPublicPrefixSecretVisibilityError(
      options.key,
      {
        visibility: options.explicitVisibility,
        type: options.type,
      }
    );
    if (publicPrefixError) {
      return { error: publicPrefixError };
    }

    return { visibility: options.explicitVisibility };
  }

  const inferred = visibilityFromEnvType(options.type);
  if (inferred === undefined) {
    return {};
  }

  const publicPrefixError = getPublicPrefixSecretVisibilityError(options.key, {
    visibility: inferred,
    type: options.type,
  });
  if (publicPrefixError) {
    return { error: publicPrefixError };
  }

  return { visibility: inferred };
}
