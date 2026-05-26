import { NowBuildError } from '@vercel/build-utils';
import type {
  ExperimentalEnvironmentVariableDefinition,
  ExperimentalEnvironmentVariables,
  VercelTargetEnvironment,
} from '@vercel/build-utils';
import { fileNameSymbol } from '@vercel/client';
import type { VercelConfig } from './dev/types';

function isRequiredForEnvironment(
  required: ExperimentalEnvironmentVariableDefinition['required'],
  environment: VercelTargetEnvironment
): boolean {
  if (required === true) {
    return true;
  }
  return required.includes(environment);
}

function isVariableSet(
  name: string,
  env: Record<string, string | undefined>
): boolean {
  const value = env[name];
  return typeof value === 'string' && value.length > 0;
}

function getPlaintextConfigSources(
  name: string,
  config: VercelConfig
): string[] {
  const sources: string[] = [];

  if (config.env && typeof config.env[name] === 'string') {
    const value = config.env[name];
    if (!value.startsWith('@')) {
      sources.push('env');
    }
  }

  if (config.build?.env && typeof config.build.env[name] === 'string') {
    const value = config.build.env[name];
    if (!value.startsWith('@')) {
      sources.push('build.env');
    }
  }

  return sources;
}

function formatRequiredEnvironments(
  required: ExperimentalEnvironmentVariableDefinition['required']
): string {
  if (required === true) {
    return 'all environments';
  }
  return required.join(', ');
}

function formatEnvFileHint(environment: VercelTargetEnvironment): string {
  return `.vercel/.env.${environment}.local`;
}

export function validateExperimentalEnvironmentVariables(
  config: VercelConfig,
  options: {
    environment: VercelTargetEnvironment;
    env: Record<string, string | undefined>;
  }
): NowBuildError | null {
  const definitions = config.experimentalEnvironmentVariables;
  if (!definitions) {
    return null;
  }

  const fileName = config[fileNameSymbol] || 'vercel.json';
  const errors: string[] = [];

  for (const [name, definition] of Object.entries(definitions)) {
    if (!isRequiredForEnvironment(definition.required, options.environment)) {
      continue;
    }

    if (!isVariableSet(name, options.env)) {
      errors.push(
        `The \`${name}\` environment variable is required for the ${options.environment} environment (configured as required for ${formatRequiredEnvironments(definition.required)} in ${fileName}) but is not set. Add it with \`vercel env add ${name} ${options.environment}\`, then run \`vercel env pull ${formatEnvFileHint(options.environment)}\` to sync it locally.`
      );
      continue;
    }

    if (definition.type === 'secret') {
      const plaintextSources = getPlaintextConfigSources(name, config);
      if (plaintextSources.length > 0) {
        errors.push(
          `The \`${name}\` environment variable is marked as a secret in ${fileName} but has a plaintext value in \`${plaintextSources.join('`, `')}\`. Remove it from ${fileName} and store it with \`vercel env add\` instead.`
        );
      }
    }
  }

  if (errors.length === 0) {
    return null;
  }

  return new NowBuildError({
    code: 'EXPERIMENTAL_ENVIRONMENT_VARIABLES',
    message: errors.join('\n\n'),
    link: 'https://vercel.com/docs/environment-variables',
    action: 'Learn More',
  });
}

export type { ExperimentalEnvironmentVariables };
