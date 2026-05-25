import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  buildCommandWithGlobalFlags,
  exitWithNonInteractiveError,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { checksRemoveFlags } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';

export async function checksRemove(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification([...checksRemoveFlags]);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: error instanceof Error ? error.message : String(error),
        },
        1
      );
    }
    printError(error);
    return 1;
  }

  if (parsedArgs.args.length < 1 || parsedArgs.args.length > 2) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message:
          'Check id is required. Example: `vercel project checks remove chk_abc123`',
        hint: 'Run `project checks` to list check ids, then pass the id to `project checks remove` (optional project name as second argument).',
        next: [
          {
            command: buildCommandWithGlobalFlags(client.argv, 'project checks'),
            when: 'List deployment checks and their ids',
          },
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'project checks remove <check_id>'
            ),
            when: 'Remove a check after replacing <check_id> with an id from the list',
          },
        ],
      },
      1
    );
    output.error(
      'Invalid number of arguments. Usage: `vercel project checks remove <checkId> [project-name]`'
    );
    return 1;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: formatResult.error,
        },
        1
      );
    }
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput || Boolean(client.nonInteractive);

  const checkId = parsedArgs.args[0]?.trim();
  if (!checkId) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message:
          'Check id is required (from `vercel project checks`). Example: `vercel project checks remove chk_abc123`',
        next: [
          {
            command: buildCommandWithGlobalFlags(client.argv, 'project checks'),
            when: 'List deployment checks and their ids',
          },
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'project checks remove <check_id>'
            ),
            when: 'Remove a check after replacing <check_id>',
          },
        ],
      },
      1
    );
    output.error('A check id is required (from `vercel project checks`).');
    return 1;
  }

  const projectNameOrId = parsedArgs.args[1];

  try {
    const project = await getProjectByCwdOrLink({
      client,
      commandName: 'project checks remove',
      projectNameOrId,
      forReadOnlyCommand: true,
    });

    const result = await client.fetch<{ success?: boolean }>(
      `/v2/projects/${encodeURIComponent(project.id)}/checks/${encodeURIComponent(checkId)}`,
      { method: 'DELETE' }
    );

    if (asJson) {
      if (client.nonInteractive) {
        client.stdout.write(
          `${JSON.stringify(
            {
              status: AGENT_STATUS.OK,
              checkId,
              projectId: project.id,
              projectName: project.name,
              result,
              message: `Removed check ${checkId} from ${project.name}.`,
              next: [
                {
                  command: buildCommandWithGlobalFlags(
                    client.argv,
                    'project checks'
                  ),
                  when: 'List remaining checks',
                },
              ],
            },
            null,
            2
          )}\n`
        );
      } else {
        client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      }
      return 0;
    }

    output.log(`Removed check ${checkId} from ${project.name}.`);
    return 0;
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'checks' });
    printError(err);
    return 1;
  }
}
