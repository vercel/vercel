import output from '../../output-manager';
import { outputAgentError } from '../agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../agent-output-constants';
import { getGlobalFlagsAndProjectFromArgs } from '../arg-common';
import type Client from '../client';
import { getCommandName, getCommandNamePlain } from '../pkg-name';
import { resolveProjectContext } from './resolve-project-context';

interface EnsureProjectLinkOptions {
  client: Client;
  commandName: string;
  projectName?: string;
}

/**
 * Resolves a project for a command family and handles the shared not-linked
 * experience without creating local project-link metadata.
 */
export async function ensureProjectLink({
  client,
  commandName,
  projectName,
}: EnsureProjectLinkOptions) {
  const link = await resolveProjectContext({
    client,
    projectNameOrId: projectName,
  });

  if (link.status === 'error') {
    return link.exitCode;
  }

  if (link.status === 'not_linked') {
    if (client.nonInteractive) {
      const flags = getGlobalFlagsAndProjectFromArgs(client.argv.slice(2));
      const command = getCommandNamePlain(`link ${flags.join(' ')}`.trim());
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.NOT_LINKED,
          userActionRequired: true,
          message: `Your codebase is not linked to a Vercel project. Run link first, then retry ${commandName} commands.`,
          next: [
            {
              command,
              when: 'to link this directory to a project',
            },
          ],
        },
        1
      );
      return 1;
    }

    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName('link')} to begin.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  return link;
}
