import type Client from '../client';
import getScope from '../get-scope';
import output from '../../output-manager';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
  shouldEmitNonInteractiveCommandError,
} from '../agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../agent-output-constants';
import getOrgById from './get-org-by-id';

/**
 * Emits a consistent "Project <x> was not found" error that names the scope
 * that was searched and points users to `--scope`, `vercel switch`, and
 * `vercel teams ls`. In non-interactive contexts (CI, agents) it also emits a
 * structured JSON payload via `outputAgentError`.
 */
export async function printProjectNotFoundError(
  client: Client,
  projectNameOrId: string,
  commandName: string,
  orgId?: string
): Promise<void> {
  let contextName: string | undefined;
  try {
    if (orgId) {
      const org = await getOrgById(client, orgId);
      contextName = org?.slug ?? orgId;
    } else {
      const scope = await getScope(client);
      contextName = scope.contextName;
    }
  } catch (err) {
    contextName = orgId;
    output.debug(`Scope lookup failed during error reporting: ${err}`);
  }

  const scopeClause = contextName ? ` (${contextName})` : '';
  const headline = `Project "${projectNameOrId}" was not found in the current scope${scopeClause}.`;

  output.error(
    `${headline}\n\n` +
      `If it lives in a different team or account:\n` +
      `  • Retry with \`--scope <team-slug|your-username>\`, or\n` +
      `  • Run \`vercel switch <team-slug|your-username>\` to change scope.\n\n` +
      `List accessible teams with \`vercel teams ls\`.`
  );

  if (!shouldEmitNonInteractiveCommandError(client)) {
    return;
  }

  const retryWithScope = buildCommandWithGlobalFlags(
    client.argv,
    `${commandName} --project ${projectNameOrId} --scope <team-slug>`
  );

  outputAgentError(
    client,
    {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.PROJECT_NOT_FOUND,
      message: `${headline} If it lives in a different team or account, retry with --scope <team-slug|your-username> or run \`vercel switch <team-slug|your-username>\` to change scope.`,
      ...(contextName ? { scope: contextName } : {}),
      next: [
        { command: 'vercel teams ls', when: 'list accessible teams' },
        { command: retryWithScope, when: 'retry with a specific team' },
        {
          command: 'vercel switch <team-slug>',
          when: 'change the default scope',
        },
      ],
    },
    1
  );
}
