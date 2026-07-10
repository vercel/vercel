import type Client from '../../../util/client';
import output from '../../../output-manager';
import { outputError } from '../../../util/command-validation';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import { validateJsonOutput } from '../../../util/output-format';
import { packageName } from '../../../util/pkg-name';

/**
 * Validates the `--format`/`--json` flags. Returns the resolved `jsonOutput`
 * flag on success, or an exit code to return immediately on failure.
 */
export function validateVcrJsonOutput(
  client: Client,
  flags: { '--format'?: string; '--json'?: boolean }
): { jsonOutput: boolean } | number {
  const fr = validateJsonOutput(flags);
  if (!fr.valid) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: fr.error,
      },
      1
    );
    output.error(fr.error);
    return 1;
  }
  return { jsonOutput: fr.jsonOutput };
}

/**
 * Validates that a flag's value is one of a fixed set of choices. Returns an
 * exit code to return immediately when invalid, or `undefined` when the
 * value is valid or unset.
 */
export function validateVcrChoice<T extends string>(
  client: Client,
  flag: string,
  value: string | undefined,
  choices: readonly T[],
  jsonOutput: boolean
): number | undefined {
  if (value === undefined || (choices as readonly string[]).includes(value)) {
    return undefined;
  }
  const message = `Invalid value for ${flag}: "${value}". Must be one of: ${choices.join(', ')}.`;
  outputAgentError(
    client,
    {
      status: 'error',
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message,
    },
    1
  );
  return outputError(client, jsonOutput, 'INVALID_ARGUMENTS', message);
}

/**
 * Requires a `<repository>` positional argument. Returns an exit code to
 * return immediately when missing, or `undefined` when present.
 */
export function requireVcrRepository(
  client: Client,
  repository: string | undefined,
  jsonOutput: boolean,
  usage: string
): number | undefined {
  if (repository) {
    return undefined;
  }
  outputAgentError(
    client,
    {
      status: 'error',
      reason: AGENT_REASON.MISSING_ARGUMENTS,
      message: `Missing repository. Example: ${packageName} ${usage}`,
      next: [
        {
          command: buildCommandWithGlobalFlags(client.argv, 'vcr ls'),
          when: 'List repositories to pick a name or id',
        },
      ],
    },
    1
  );
  return outputError(
    client,
    jsonOutput,
    'MISSING_ARGUMENTS',
    `Usage: \`vercel ${usage}\``
  );
}

/**
 * Requires `<repository>` and `<tag>` positional arguments. Returns an exit
 * code to return immediately when either is missing, or `undefined` when both
 * are present.
 */
export function requireVcrRepositoryAndTag(
  client: Client,
  repository: string | undefined,
  tag: string | undefined,
  jsonOutput: boolean,
  usage: string
): number | undefined {
  if (repository && tag) {
    return undefined;
  }
  outputAgentError(
    client,
    {
      status: 'error',
      reason: AGENT_REASON.MISSING_ARGUMENTS,
      message: `Missing arguments. Example: ${packageName} ${usage}`,
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            'vcr tag ls <repository>'
          ),
          when: 'List tags to pick a tag (replace <repository>)',
        },
      ],
    },
    1
  );
  return outputError(
    client,
    jsonOutput,
    'MISSING_ARGUMENTS',
    `Usage: \`vercel ${usage}\``
  );
}

/**
 * Requires `<repository>` and `<imageId>` positional arguments. Returns an
 * exit code to return immediately when either is missing, or `undefined`
 * when both are present.
 */
export function requireVcrRepositoryAndImageId(
  client: Client,
  repository: string | undefined,
  imageId: string | undefined,
  jsonOutput: boolean,
  usage: string
): number | undefined {
  if (repository && imageId) {
    return undefined;
  }
  outputAgentError(
    client,
    {
      status: 'error',
      reason: AGENT_REASON.MISSING_ARGUMENTS,
      message: `Missing arguments. Example: ${packageName} ${usage}`,
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            'vcr image ls <repository>'
          ),
          when: 'List images to pick an image id (replace <repository>)',
        },
      ],
    },
    1
  );
  return outputError(
    client,
    jsonOutput,
    'MISSING_ARGUMENTS',
    `Usage: \`vercel ${usage}\``
  );
}
