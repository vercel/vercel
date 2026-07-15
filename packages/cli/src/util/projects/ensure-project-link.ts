import type Client from '../client';
import output from '../../output-manager';
import { getGlobalFlagsFromArgs } from '../arg-common';
import { outputAgentError } from '../agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../agent-output-constants';
import { getCommandName, getCommandNamePlain } from '../pkg-name';
import { resolveProjectContext } from './resolve-project-context';

export type ProjectLinkCommand = 'redirects' | 'routes' | 'firewall';

export async function ensureProjectLink(
  client: Client,
  command: ProjectLinkCommand,
  projectName?: string
) {
  const link = await resolveProjectContext({
    client,
    projectNameOrId: projectName,
  });

  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    if (client.nonInteractive) {
      if (command === 'redirects') {
        const linkCmd = getCommandNamePlain('link');
        outputAgentError(
          client,
          {
            status: AGENT_STATUS.ERROR,
            reason: AGENT_REASON.NOT_LINKED,
            message: `Your codebase isn't linked to a project on Vercel. Run ${linkCmd} to begin.`,
            next: [{ command: linkCmd }],
          },
          1
        );
      } else {
        const flags = getGlobalFlagsFromArgs(client.argv.slice(2));
        const cmd = getCommandNamePlain(`link ${flags.join(' ')}`.trim());
        outputAgentError(
          client,
          {
            status: AGENT_STATUS.ERROR,
            reason: AGENT_REASON.NOT_LINKED,
            userActionRequired: true,
            message: `Your codebase is not linked to a Vercel project. Run link first, then retry ${command} commands.`,
            next: [
              {
                command: cmd,
                when: 'to link this directory to a project',
              },
            ],
          },
          1
        );
        return 1;
      }
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
