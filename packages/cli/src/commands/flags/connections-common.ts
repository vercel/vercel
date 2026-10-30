import type Client from '../../util/client';
import type { Project, ProjectLinked } from '@vercel-internals/types';
import { ProjectNotFound } from '../../util/errors-ts';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import {
  type AgentErrorPayload,
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import output from '../../output-manager';
import { getLinkedFlagsProject } from './project';

/**
 * Keeps `--project` on every suggested follow-up command: the source project
 * comes from it, so dropping it would point the agent at a different source.
 */
export function connectionsCommand(client: Client, template: string): string {
  return buildCommandWithGlobalFlags(client.argv, template, undefined, {
    preserveProject: true,
    excludeFlags: ['--yes'],
  });
}

/** Emits the agent payload in non-interactive mode, a fatal line otherwise. */
export function connectionsError(
  client: Client,
  payload: Omit<AgentErrorPayload, 'status'>,
  exitCode: 1 | 2 = 1
): number {
  outputAgentError(
    client,
    {
      ...payload,
      status: AGENT_STATUS.ERROR,
      next: payload.next?.map(next => ({
        ...next,
        command: connectionsCommand(client, next.command),
      })),
    },
    exitCode
  );
  if (!client.nonInteractive) {
    output.fatal(payload.message);
  }
  return exitCode;
}

export async function resolveSourceProject(
  client: Client,
  projectName: string | undefined
): Promise<ProjectLinked | number> {
  const link = await getLinkedFlagsProject(client, projectName);
  if (link.status === 'error') {
    return link.exitCode;
  }
  if (link.status === 'not_linked') {
    return connectionsError(client, {
      reason: AGENT_REASON.NOT_LINKED,
      message: `Your codebase isn't linked to a project on Vercel. Pass --project <name>, or run ${getCommandName('link')} to link it.`,
      next: [{ command: 'link', when: 'link the project' }],
    });
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  return link;
}

export async function resolveConsumerProject(
  client: Client,
  link: ProjectLinked,
  consumerNameOrId: string | undefined,
  usage: string
): Promise<Project | number> {
  if (!consumerNameOrId) {
    return connectionsError(
      client,
      {
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: `Please provide the name or ID of the consumer project: ${getCommandName(usage)}`,
        next: [{ command: usage, when: 'name the consumer project' }],
      },
      2
    );
  }

  let consumer: Project | ProjectNotFound;
  try {
    consumer = await getProjectByNameOrId(
      client,
      consumerNameOrId,
      link.org.type === 'team' ? link.org.id : undefined
    );
  } catch (err) {
    printError(err);
    return 1;
  }

  if (consumer instanceof ProjectNotFound) {
    return connectionsError(client, {
      reason: AGENT_REASON.NOT_FOUND,
      message: `Project "${consumerNameOrId}" was not found in team ${link.org.slug}.`,
    });
  }

  if (consumer.id === link.project.id) {
    return connectionsError(
      client,
      {
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: 'A project cannot be connected to its own flags.',
      },
      2
    );
  }

  return consumer;
}
