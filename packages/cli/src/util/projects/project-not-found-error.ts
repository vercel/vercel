import type Client from '../client';
import type { Project } from '@vercel-internals/types';
import getScope from '../get-scope';
import output from '../../output-manager';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
  shouldEmitNonInteractiveCommandError,
} from '../agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../agent-output-constants';
import { suggestCorrection } from '../command-correction';
import getOrgById from './get-org-by-id';

export interface ProjectNotFoundErrorOptions {
  /**
   * Command that creates the missing project, offered as the next step. Also
   * turns on a `Did you mean <project>?` suggestion from the team's projects.
   * `note` says how to fill the command's placeholders, when it has any.
   */
  createCommand?: { command: string; note?: string };
}

/**
 * One project in the team whose name is a single edit away from `name`, or
 * nothing. Best effort: only the 100 most recent projects are checked, and a
 * failed lookup suggests nothing.
 */
async function findSimilarProjectName(
  client: Client,
  name: string,
  orgId?: string
): Promise<string | undefined> {
  try {
    const { projects } = await client.fetch<{ projects: Project[] }>(
      '/v9/projects?limit=100',
      { accountId: orgId }
    );
    // Remote names reach the message only when they are plain project names.
    return suggestCorrection(
      name,
      projects
        .map(project => project.name)
        .filter(projectName => /^[a-z0-9._-]+$/i.test(projectName))
    );
  } catch (err) {
    output.debug(`Project suggestion lookup failed: ${err}`);
    return undefined;
  }
}

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
  orgId?: string,
  { createCommand }: ProjectNotFoundErrorOptions = {}
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
  const suggestion = createCommand
    ? await findSimilarProjectName(client, projectNameOrId, orgId)
    : undefined;
  const suggestionLine = suggestion ? ` Did you mean ${suggestion}?` : '';
  const createNote = createCommand?.note;

  output.error(
    `${headline}${suggestionLine}\n\n` +
      (createCommand
        ? `To create it${createNote ? `, ${createNote}` : ''}:\n  ${createCommand.command}\n\n`
        : '') +
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
      message: `${headline}${suggestionLine}${createCommand ? ` To create it, retry with --create-if-missing${createNote ? `, and ${createNote}` : ''}.` : ''} If it lives in a different team or account, retry with --scope <team-slug|your-username> or run \`vercel switch <team-slug|your-username>\` to change scope.`,
      ...(contextName ? { scope: contextName } : {}),
      ...(suggestion ? { data: { suggestion } } : {}),
      next: [
        ...(createCommand
          ? [
              {
                command: createCommand.command,
                when: `create the project${createNote ? `; ${createNote}` : ''}`,
              },
            ]
          : []),
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
