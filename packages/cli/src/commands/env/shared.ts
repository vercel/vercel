import type Client from '../../util/client';
import type {
  CustomEnvironment,
  ProjectEnvVariable,
} from '@vercel-internals/types';
import type { EnvRecordsSource } from '../../util/env/get-env-records';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import getEnvRecords from '../../util/env/get-env-records';
import { getCustomEnvironments } from '../../util/target/get-custom-environments';
import { getCommandName } from '../../util/pkg-name';
import { isAPIError } from '../../util/errors-ts';
import { isKnownError } from '../../util/env/known-error';
import output from '../../output-manager';
import {
  outputActionRequired,
  outputAgentError,
  type ActionRequiredPayload,
} from '../../util/agent-output';

/**
 * Parses CLI arguments with the standard agent-error-on-failure pattern.
 * Returns parsed args or `null` on failure (caller should `return 1`).
 */
export function parseEnvArgs(
  client: Client,
  argv: string[],
  flagsSpecification: Record<string, unknown>
) {
  try {
    return parseArguments(argv, flagsSpecification);
  } catch (err) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: err instanceof Error ? err.message : String(err),
        },
        1
      );
    }
    printError(err);
    return null;
  }
}

type LinkedResult = {
  status: 'linked';
  project: { id: string; name: string };
  org: { type: string; id: string };
  envs: ProjectEnvVariable[];
  customEnvironments: CustomEnvironment[];
};

type LinkErrorResult = {
  status: 'error';
  exitCode: number;
};

type NotLinkedResult = {
  status: 'not_linked';
};

export type ResolveLinkedResult =
  | LinkedResult
  | LinkErrorResult
  | NotLinkedResult;

/**
 * Resolves the linked project, sets currentTeam, and fetches env records + custom environments.
 *
 * On error: returns `{ status: 'error', exitCode }`.
 * On not_linked: prints the interactive error message and returns `{ status: 'not_linked' }`.
 *   Non-interactive not_linked handling is NOT done here (each command has its own agent output logic).
 * On linked: returns `{ status: 'linked', project, org, envs, customEnvironments }`.
 */
export async function resolveLinkedProjectWithEnvs(
  client: Client,
  source: EnvRecordsSource
): Promise<ResolveLinkedResult> {
  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return { status: 'error', exitCode: link.exitCode };
  }
  if (link.status === 'not_linked') {
    if (!client.nonInteractive) {
      output.error(
        `Your codebase isn't linked to a project on Vercel. Run ${getCommandName(
          'link'
        )} to begin.`
      );
    }
    return { status: 'not_linked' };
  }
  const { project, org } = link;
  client.config.currentTeam = org.type === 'team' ? org.id : undefined;
  const [{ envs }, customEnvironments] = await Promise.all([
    getEnvRecords(client, project.id, source),
    getCustomEnvironments(client, project.id),
  ]);
  return { status: 'linked', project, org, envs, customEnvironments };
}

/**
 * Resolves the env value from stdin, --value flag, or interactive prompt.
 * If non-interactive and no value is available, outputs the action_required payload.
 */
export async function resolveEnvValue(opts: {
  stdInput: string | null;
  valueFromFlag: string | undefined;
  client: Client;
  nonInteractivePayload?: ActionRequiredPayload;
  promptFn: () => Promise<string>;
}): Promise<string> {
  if (opts.stdInput) {
    return opts.stdInput;
  }
  if (opts.valueFromFlag !== undefined) {
    return opts.valueFromFlag;
  }
  if (opts.client.nonInteractive && opts.nonInteractivePayload) {
    outputActionRequired(opts.client, opts.nonInteractivePayload);
  }
  return opts.promptFn();
}

/**
 * Handles API errors from env add/update operations.
 * Returns `1` for known errors, re-throws unknown errors.
 */
export function handleEnvApiError(client: Client, err: unknown): 1 {
  if (client.nonInteractive && isAPIError(err)) {
    const reason =
      (err as { slug?: string }).slug ||
      (err.serverMessage?.toLowerCase().includes('branch')
        ? 'branch_not_found'
        : 'api_error');
    outputAgentError(
      client,
      {
        status: 'error',
        reason,
        message: err.serverMessage,
      },
      1
    );
  }
  if (isAPIError(err) && isKnownError(err)) {
    output.error(err.serverMessage);
    return 1;
  }
  throw err;
}
