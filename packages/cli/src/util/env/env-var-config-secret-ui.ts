import type {
  ProjectEnvType,
  ProjectEnvVariable,
} from '@vercel-internals/types';
import { getApiPublicPrefix } from './validate-env';

export type EnvVariableVisibility = 'config' | 'secret';
export type EnvVariableTypeOptionSource = 'type' | 'visibility';
export type EnvVariableTypeOptionErrorReason =
  | 'invalid_type'
  | 'invalid_visibility'
  | 'conflicting_type_visibility';

export const ENV_VISIBILITY_DEPRECATION_MESSAGE =
  '`--visibility` is deprecated. Use `--type` instead.';

export interface ResolveEnvVarTypeOptionResult {
  explicitVisibility?: string;
  source?: EnvVariableTypeOptionSource;
  usedDeprecatedVisibility: boolean;
  error?: string;
  errorReason?: EnvVariableTypeOptionErrorReason;
}

function invalidTypeOptionError(
  optionName: '--type' | '--visibility',
  value: string
): string | undefined {
  if (value === 'config' || value === 'secret') {
    return undefined;
  }
  if (value === 'sensitive') {
    return `The \`${optionName}\` flag accepts \`config\` or \`secret\`. Use \`--type secret\` or the legacy \`--sensitive\` flag.`;
  }
  if (value === 'plain' || value === 'encrypted') {
    return `The \`${optionName}\` flag accepts \`config\` or \`secret\`. Use \`--type config\` for readable values.`;
  }
  return `The \`${optionName}\` flag must be either \`config\` or \`secret\`.`;
}

/** Resolves the canonical `--type` option and its deprecated alias. */
export function resolveEnvVarTypeOption(options: {
  type?: string;
  visibility?: string;
}): ResolveEnvVarTypeOptionResult {
  const usedDeprecatedVisibility = options.visibility !== undefined;
  if (options.type !== undefined) {
    const error = invalidTypeOptionError('--type', options.type);
    if (error) {
      return {
        usedDeprecatedVisibility,
        error,
        errorReason: 'invalid_type',
      };
    }
  }
  if (options.visibility !== undefined) {
    const error = invalidTypeOptionError('--visibility', options.visibility);
    if (error) {
      return {
        usedDeprecatedVisibility,
        error,
        errorReason: 'invalid_visibility',
      };
    }
  }
  if (
    options.type !== undefined &&
    options.visibility !== undefined &&
    options.type !== options.visibility
  ) {
    return {
      usedDeprecatedVisibility,
      error: `\`--type ${options.type}\` conflicts with \`--visibility ${options.visibility}\`. \`--visibility\` is a deprecated alias of \`--type\`; remove it.`,
      errorReason: 'conflicting_type_visibility',
    };
  }
  if (options.type !== undefined) {
    return {
      explicitVisibility: options.type,
      source: 'type',
      usedDeprecatedVisibility,
    };
  }
  if (options.visibility !== undefined) {
    return {
      explicitVisibility: options.visibility,
      source: 'visibility',
      usedDeprecatedVisibility,
    };
  }
  return { usedDeprecatedVisibility };
}

/** Supports both legacy and Config/Secret API record shapes. */
export function isSecretEnvVar(
  env: Pick<ProjectEnvVariable, 'type' | 'visibility'>
): boolean {
  return env.type === 'sensitive' || env.visibility === 'secret';
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

/**
 * Omits inferred visibility for public-prefixed keys only when the API team
 * policy will force-coerce type to sensitive (cannot safely set visibility).
 */
function shouldOmitInferredVisibility(
  key: string,
  envTargets: string[],
  teamSensitivePolicyOn: boolean
): boolean {
  if (!getApiPublicPrefix(key)) {
    return false;
  }

  if (!hasNonDevelopmentTarget(envTargets)) {
    return false;
  }

  return teamSensitivePolicyOn;
}

export interface ResolveEnvVarVisibilityOptions {
  explicitVisibility?: string;
  explicitOptionSource?: EnvVariableTypeOptionSource;
  type: ProjectEnvType;
  key: string;
  envTargets: string[];
  teamSensitivePolicyOn: boolean;
  context?: 'add' | 'update';
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
  if (options.explicitVisibility !== undefined) {
    if (
      options.explicitVisibility !== 'config' &&
      options.explicitVisibility !== 'secret'
    ) {
      const optionName =
        options.explicitOptionSource === 'visibility'
          ? '--visibility'
          : '--type';
      return {
        error:
          options.explicitVisibility === 'sensitive'
            ? `The \`${optionName}\` flag accepts \`config\` or \`secret\`. Use \`--type secret\` or the legacy \`--sensitive\` flag.`
            : options.explicitVisibility === 'plain' ||
                options.explicitVisibility === 'encrypted'
              ? `The \`${optionName}\` flag accepts \`config\` or \`secret\`. Use \`--type config\` for readable values.`
              : `The \`${optionName}\` flag must be either \`config\` or \`secret\`.`,
      };
    }

    const publicPrefixError = getPublicPrefixSecretVisibilityError(
      options.key,
      {
        visibility: options.explicitVisibility,
        type: options.type,
        context: options.context,
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
    context: options.context,
  });
  if (publicPrefixError) {
    return { error: publicPrefixError };
  }

  return { visibility: inferred };
}
