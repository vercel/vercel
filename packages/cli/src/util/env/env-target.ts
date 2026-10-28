import type { ProjectEnvTarget } from '@vercel-internals/types';
import { PROJECT_ENV_TARGET } from '@vercel-internals/constants';
import title from 'title';
import type Client from '../client';
import { warnDeprecatedInput } from '../warn-deprecated-subcommand';

export const envTargetChoices = PROJECT_ENV_TARGET.map(t => ({
  name: title(t),
  value: t,
}));

export function isValidEnvTarget(
  target?: string
): target is ProjectEnvTarget | undefined {
  // Specify `map` returns strings, instead of string constants so `.includes` works
  return (
    typeof target === 'undefined' ||
    envTargetChoices.map<string>(c => c.value).includes(target)
  );
}

export function getEnvTargetPlaceholder() {
  return `<${envTargetChoices.map(c => c.value).join(' | ')}>`;
}

export function parseEnvTargetArg(arg: string): string[] {
  return Array.from(
    new Set(
      arg
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)
    )
  );
}

export interface EnvTargetInput {
  /** `--environment`. `env add` may repeat it. */
  environment: string | string[] | undefined;
  /** `--git-branch`. */
  gitBranch: string | undefined;
  /** The deprecated bare arguments after the variable name. */
  legacyEnvironment: string | undefined;
  legacyGitBranch: string | undefined;
}

export type EnvTargetResult =
  | { environment: string | undefined; gitBranch: string | undefined }
  | { error: string };

/**
 * `env add`, `env list`, `env remove`, and `env update` used to take the
 * environment and Git branch as bare arguments (`env remove API_TOKEN preview
 * feat-1`). They are `--environment` and `--git-branch` now. The bare form
 * keeps working with a deprecation warning, and giving a value both ways is a
 * usage error. A repeated `--environment` is joined into the comma-separated
 * list the bare argument accepts.
 */
export function resolveEnvTargetInput(
  client: Client,
  input: EnvTargetInput
): EnvTargetResult {
  const environment = Array.isArray(input.environment)
    ? input.environment.join(',')
    : input.environment;

  if (input.legacyEnvironment !== undefined && environment !== undefined) {
    return {
      error:
        "Can't use an environment argument with --environment. Use --environment, and --git-branch for a Git branch.",
    };
  }
  if (input.legacyGitBranch !== undefined && input.gitBranch !== undefined) {
    return {
      error:
        "Can't use a Git branch argument with --git-branch. Use --git-branch.",
    };
  }

  if (input.legacyEnvironment !== undefined) {
    warnDeprecatedInput(client, 'The environment argument', '--environment');
  }
  if (input.legacyGitBranch !== undefined) {
    warnDeprecatedInput(client, 'The Git branch argument', '--git-branch');
  }

  return {
    environment: environment ?? input.legacyEnvironment,
    gitBranch: input.gitBranch ?? input.legacyGitBranch,
  };
}
