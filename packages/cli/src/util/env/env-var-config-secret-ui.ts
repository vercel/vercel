import type { ProjectEnvType } from '@vercel-internals/types';
import { getPublicPrefix } from './validate-env';

export type EnvVariableVisibility = 'config' | 'secret';

/**
 * Opt-in CLI support for the config/secret env var model (dashboard flag:
 * `env-var-config-secret-ui`). When enabled, the CLI skips legacy Sensitive
 * Environment Variables Policy coercion. Development still disallows secrets.
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

/** Human-readable visibility for CLI output. */
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

function hasNonDevelopmentTarget(envTargets: string[]): boolean {
  return envTargets.some(target => target !== 'development');
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
    envTargets: string[];
  }
): string | null {
  const publicPrefix = getPublicPrefix(key);
  if (!publicPrefix) {
    return null;
  }

  const wouldBeSecret =
    options.visibility === 'secret' || options.type === 'sensitive';
  if (!wouldBeSecret) {
    return null;
  }

  const prefixLabel = publicPrefix.replace(/_$/, '');
  if (hasNonDevelopmentTarget(options.envTargets)) {
    return `Environment variables with a public framework prefix (${prefixLabel}) cannot use secret visibility on Production or Preview. Target Development only, rename to remove the public prefix, or use \`--visibility config\` with \`--no-sensitive\` on Development.`;
  }

  return `Environment variables with a public framework prefix (${prefixLabel}) cannot use secret visibility. Rename to remove the public prefix or use \`--visibility config\` with \`--no-sensitive\`.`;
}

/**
 * Returns a client-side error when secrets are requested for Development.
 */
export function getDevelopmentSecretVisibilityError(
  envTargets: string[],
  options: {
    type: ProjectEnvType;
    visibility?: EnvVariableVisibility;
  }
): string | null {
  if (!envTargets.includes('development')) {
    return null;
  }

  const wouldBeSecret =
    options.type === 'sensitive' || options.visibility === 'secret';
  if (!wouldBeSecret) {
    return null;
  }

  const hasNonDevelopment = envTargets.some(target => target !== 'development');
  if (hasNonDevelopment) {
    return `Sensitive Environment Variables are not supported on the Development Environment. Add --no-sensitive to store a non-sensitive value for all selected Environments, or run \`vercel env add\` separately for Development.`;
  }

  return `--sensitive is not allowed with the Development Environment. Sensitive Environment Variables are only supported on Production and Preview.`;
}

/**
 * Omits inferred visibility for public-prefixed keys only when the API team
 * policy will force-coerce type to sensitive (cannot safely set visibility).
 */
function shouldOmitInferredVisibility(
  key: string,
  envTargets: string[],
  teamSensitivePolicyOn: boolean
): boolean {
  if (!getPublicPrefix(key)) {
    return false;
  }

  if (!hasNonDevelopmentTarget(envTargets)) {
    return false;
  }

  return teamSensitivePolicyOn;
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
 * Resolves `visibility` for API requests. Uses `--visibility` when set;
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
        error: 'The `--visibility` flag must be either `config` or `secret`.',
      };
    }

    const publicPrefixError = getPublicPrefixSecretVisibilityError(
      options.key,
      {
        visibility: options.explicitVisibility,
        type: options.type,
        envTargets: options.envTargets,
      }
    );
    if (publicPrefixError) {
      return { error: publicPrefixError };
    }

    const developmentError = getDevelopmentSecretVisibilityError(
      options.envTargets,
      {
        type: options.type,
        visibility: options.explicitVisibility,
      }
    );
    if (developmentError) {
      return { error: developmentError };
    }

    return { visibility: options.explicitVisibility };
  }

  const inferred = visibilityFromEnvType(options.type);
  if (inferred === undefined) {
    return {};
  }

  const developmentError = getDevelopmentSecretVisibilityError(
    options.envTargets,
    {
      type: options.type,
      visibility: inferred,
    }
  );
  if (developmentError) {
    return { error: developmentError };
  }

  if (
    shouldOmitInferredVisibility(
      options.key,
      options.envTargets,
      options.teamSensitivePolicyOn
    )
  ) {
    return {};
  }

  const publicPrefixError = getPublicPrefixSecretVisibilityError(options.key, {
    visibility: inferred,
    type: options.type,
    envTargets: options.envTargets,
  });
  if (publicPrefixError) {
    return { error: publicPrefixError };
  }

  return { visibility: inferred };
}
