import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  type ActionRequiredPayload,
  buildCommandWithGlobalFlags,
  exitWithNonInteractiveError,
  outputActionRequired,
  outputAgentError,
  shouldEmitNonInteractiveCommandError,
} from '../../util/agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';
import { membersRemoveFlags } from './command';
import { canPrompt } from '../../util/can-prompt';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import { ProjectTelemetryClient } from '../../util/telemetry/commands/project';
import type { ProjectMember, ProjectMembersResponse } from './members';

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

async function findProjectMember(
  client: Client,
  projectId: string,
  identifier: string
): Promise<ProjectMember | undefined> {
  let until: number | undefined;
  for (let page = 0; page < 100; page++) {
    const query = new URLSearchParams({ limit: '100' });
    if (until) {
      query.set('until', String(until));
    }
    const { members, pagination } = await client.fetch<ProjectMembersResponse>(
      `/v1/projects/${encodeURIComponent(projectId)}/members?${query.toString()}`
    );
    const match = findMember(members ?? [], identifier);
    if (match) {
      return match;
    }
    const next = (pagination as { next?: number | null } | undefined)?.next;
    if (!members || members.length === 0 || !next) {
      return undefined;
    }
    until = next;
  }
  return undefined;
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
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: error instanceof Error ? error.message : String(error),
    });
    printError(error);
    return 1;
  }

  const [projectNameOrId, member] = parsedArgs.args;
  telemetry.trackCliArgumentProject(projectNameOrId);
  telemetry.trackCliArgumentMember(member);

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: formatResult.error,
    });
    output.error(formatResult.error);
    return 1;
  }

  const { jsonOutput } = formatResult;
  const asJson = jsonOutput || !canPrompt(client);

  function fail(
    reason: string,
    message: string,
    humanMessage: string = message,
    extra?: Record<string, unknown>
  ): number {
    if (shouldEmitNonInteractiveCommandError(client)) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason,
        message,
        ...extra,
      });
      return 1;
    }
    if (jsonOutput || !canPrompt(client)) {
      client.stdout.write(
        `${JSON.stringify(
          { status: AGENT_STATUS.ERROR, reason, message },
          null,
          2
        )}\n`
      );
      return 1;
    }
    output.error(humanMessage);
    return 1;
  }

  if (parsedArgs.args.length !== 2) {
    const cmd = buildCommandWithGlobalFlags(
      client.argv,
      'project members remove <project> <member>'
    );
    return fail(
      AGENT_REASON.INVALID_ARGUMENTS,
      'Invalid number of arguments. Usage: `vercel project members remove <project> <member>`',
      'Invalid number of arguments. Usage: `vercel project members remove <project> <member>`',
      {
        next: [
          {
            command: cmd,
            when: 'Remove a member from a project (replace <project> and <member>)',
          },
        ],
      }
    );
  }

  let project;
  let target: ProjectMember | undefined;
  try {
    project = await getProjectByCwdOrLink({
      client,
      commandName: 'project members remove',
      projectNameOrId,
      forReadOnlyCommand: true,
    });

    target = await findProjectMember(client, project.id, member);
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'members' });
    if (jsonOutput || !canPrompt(client)) {
      client.stdout.write(
        `${JSON.stringify(
          {
            status: AGENT_STATUS.ERROR,
            reason: 'unexpected_error',
            message: err instanceof Error ? err.message : String(err),
          },
          null,
          2
        )}\n`
      );
      return 1;
    }
    printError(err);
    return 1;
  }

  if (!target) {
    const message = `${member} is not a member of ${project.name}.`;
    return fail(AGENT_REASON.NOT_FOUND, message, message, {
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            `project members ${project.name}`
          ),
          when: 'List current members to find the right identifier',
        },
      ],
    });
  }

  const memberLabel = target.username || target.email || target.uid;

  if (!canPrompt(client)) {
    const actionRequired: ActionRequiredPayload = {
      status: AGENT_STATUS.ACTION_REQUIRED,
      reason: AGENT_REASON.CONFIRMATION_REQUIRED,
      action: AGENT_ACTION.CONFIRMATION_REQUIRED,
      userActionRequired: true,
      message: `Removing ${memberLabel} from ${project.name} requires interactive confirmation and cannot be done non-interactively.`,
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            'project members remove <project> <member>'
          ),
          when: 'user runs this command in an interactive terminal',
        },
      ],
    };
    outputActionRequired(client, actionRequired, 1);
    client.stdout.write(`${JSON.stringify(actionRequired, null, 2)}\n`);
    return 1;
  }

  const confirmed = await client.input.confirm(
    `Remove ${chalk.bold(memberLabel)} from ${chalk.bold(project.name)}?`,
    false
  );
  if (!confirmed) {
    output.log('Canceled.');
    return 0;
  }

  try {
    const result = await client.fetch<Record<string, unknown>>(
      `/v1/projects/${encodeURIComponent(project.id)}/members/${encodeURIComponent(target.uid)}`,
      { method: 'DELETE' }
    );

    if (asJson) {
      if (shouldEmitNonInteractiveCommandError(client)) {
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
    if (jsonOutput || !canPrompt(client)) {
      client.stdout.write(
        `${JSON.stringify(
          {
            status: AGENT_STATUS.ERROR,
            reason: 'unexpected_error',
            message: err instanceof Error ? err.message : String(err),
          },
          null,
          2
        )}\n`
      );
      return 1;
    }
    printError(err);
    return 1;
  }
}
