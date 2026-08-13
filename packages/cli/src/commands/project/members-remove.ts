import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  buildCommandWithYes,
  buildCommandWithGlobalFlags,
  exitWithNonInteractiveError,
  outputActionRequired,
  outputAgentError,
} from '../../util/agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';
import { membersRemoveFlags } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import { ProjectTelemetryClient } from '../../util/telemetry/commands/project';

interface ProjectMember {
  uid: string;
  username?: string;
  email?: string;
  name?: string;
}

interface ProjectMembersResponse {
  members?: ProjectMember[];
}

/** Finds the member whose uid, username, or email matches `identifier`. */
function findMember(
  members: ProjectMember[],
  identifier: string
): ProjectMember | undefined {
  const needle = identifier.toLowerCase();
  return members.find(
    m =>
      m.uid === identifier ||
      m.username?.toLowerCase() === needle ||
      m.email?.toLowerCase() === needle
  );
}

export async function membersRemove(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new ProjectTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification([...membersRemoveFlags]);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: error instanceof Error ? error.message : String(error),
        },
        1
      );
    }
    printError(error);
    return 1;
  }

  if (parsedArgs.args.length !== 2) {
    const cmd = buildCommandWithGlobalFlags(
      client.argv,
      'project members remove <project> <member> --yes'
    );
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message:
            'Invalid number of arguments. Usage: `vercel project members remove <project> <member>`',
          next: [
            {
              command: cmd,
              when: 'Remove a member from a project (replace <project> and <member>)',
            },
          ],
        },
        1
      );
    }
    output.error(
      'Invalid number of arguments. Usage: `vercel project members remove <project> <member>`'
    );
    return 1;
  }

  const [projectNameOrId, member] = parsedArgs.args;
  telemetry.trackCliArgumentProject(projectNameOrId);
  telemetry.trackCliArgumentMember(member);
  telemetry.trackCliFlagYes(parsedArgs.flags['--yes']);

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
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
  const skipConfirmation = Boolean(parsedArgs.flags['--yes']);

  let project;
  let target: ProjectMember | undefined;
  try {
    project = await getProjectByCwdOrLink({
      client,
      commandName: 'project members remove',
      projectNameOrId,
      forReadOnlyCommand: true,
    });

    const query = new URLSearchParams({ search: member, limit: '100' });
    const result = await client.fetch<ProjectMembersResponse>(
      `/v1/projects/${encodeURIComponent(project.id)}/members?${query.toString()}`
    );
    target = findMember(result.members ?? [], member);
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'members' });
    printError(err);
    return 1;
  }

  if (!target) {
    const message = `${member} is not a member of ${project.name}.`;
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.NOT_FOUND,
          message,
          next: [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                `project members ${project.name}`
              ),
              when: 'List current members to find the right identifier',
            },
          ],
        },
        1
      );
    }
    output.error(message);
    return 1;
  }

  const memberLabel = target.username || target.email || target.uid;

  if (client.nonInteractive && !skipConfirmation) {
    outputActionRequired(
      client,
      {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        action: AGENT_ACTION.CONFIRMATION_REQUIRED,
        message: `In non-interactive mode --yes is required to remove ${memberLabel} from ${project.name}.`,
        next: [
          {
            command: buildCommandWithYes(client.argv),
            when: 'to confirm removal',
          },
        ],
      },
      1
    );
    return 1;
  }

  if (!skipConfirmation) {
    const confirmed = await client.input.confirm(
      `Remove ${chalk.bold(memberLabel)} from ${chalk.bold(project.name)}?`,
      false
    );
    if (!confirmed) {
      output.log('Canceled.');
      return 0;
    }
  }

  try {
    const result = await client.fetch<Record<string, unknown>>(
      `/v1/projects/${encodeURIComponent(project.id)}/members/${encodeURIComponent(target.uid)}`,
      { method: 'DELETE' }
    );

    if (asJson) {
      if (client.nonInteractive) {
        client.stdout.write(
          `${JSON.stringify(
            {
              status: AGENT_STATUS.OK,
              projectId: project.id,
              projectName: project.name,
              uid: target.uid,
              result,
              message: `Removed ${memberLabel} from ${project.name}.`,
              next: [
                {
                  command: buildCommandWithGlobalFlags(
                    client.argv,
                    `project members ${project.name}`
                  ),
                  when: 'List remaining members',
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

    output.log(`Removed ${memberLabel} from ${project.name}.`);
    return 0;
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'members' });
    printError(err);
    return 1;
  }
}
