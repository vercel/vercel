import type Client from '../../../util/client';
import getScope from '../../../util/get-scope';
import getProjectByNameOrId from '../../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound, isAPIError } from '../../../util/errors-ts';
import { getLinkedProject } from '../../../util/projects/link';
import { outputError } from '../../../util/command-validation';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';

export interface VcrScope {
  teamId: string;
  teamSlug: string;
  projectId: string;
  projectName: string;
}

function emitVcrScopeError(
  client: Client,
  jsonOutput: boolean,
  code: string,
  message: string,
  agent: {
    reason: string;
    hint?: string;
    next?: Array<{ command: string; when?: string }>;
  }
): number {
  outputAgentError(
    client,
    {
      status: 'error',
      reason: agent.reason,
      message,
      hint: agent.hint,
      next: agent.next,
    },
    1
  );
  return outputError(client, jsonOutput, code, message);
}

/**
 * Every Vercel Container Registry endpoint is project-scoped, so all commands
 * resolve a `{ teamId, projectId }` pair. When `--project` is passed the project
 * is resolved within the current team scope; otherwise the linked project is
 * used.
 */
export async function resolveVcrScope(
  client: Client,
  opts: { project?: string; jsonOutput: boolean }
): Promise<VcrScope | number> {
  if (opts.project) {
    const { team } = await getScope(client);
    if (!team) {
      const msg =
        'No team context found. Run `vercel switch` to select a team, or use `vercel link` in a project directory.';
      return emitVcrScopeError(client, opts.jsonOutput, 'NO_TEAM', msg, {
        reason: AGENT_REASON.MISSING_SCOPE,
        hint: 'Select a team scope before using --project with vcr.',
        next: [
          {
            command: buildCommandWithGlobalFlags(client.argv, 'whoami'),
            when: 'See current user and team',
          },
          {
            command: buildCommandWithGlobalFlags(client.argv, 'teams switch'),
            when: 'Switch to a team that owns the project',
          },
        ],
      });
    }

    let projectResult: Awaited<ReturnType<typeof getProjectByNameOrId>>;
    try {
      projectResult = await getProjectByNameOrId(client, opts.project, team.id);
    } catch (err) {
      if (isAPIError(err)) {
        const msg =
          err.serverMessage ||
          (err.status === 403
            ? `You do not have permission to access project "${opts.project}" in team "${team.slug}".`
            : `API error (${err.status}).`);
        const reason =
          err.status === 401
            ? 'not_authorized'
            : err.status === 403
              ? 'forbidden'
              : AGENT_REASON.API_ERROR;
        return emitVcrScopeError(
          client,
          opts.jsonOutput,
          err.code || 'API_ERROR',
          msg,
          {
            reason,
            next: [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  'vcr ls --project <name_or_id>'
                ),
                when: 'Retry with a project you can access (replace <name_or_id>)',
              },
            ],
          }
        );
      }
      throw err;
    }

    if (projectResult instanceof ProjectNotFound) {
      const msg = `Project "${opts.project}" was not found in team "${team.slug}".`;
      return emitVcrScopeError(
        client,
        opts.jsonOutput,
        'PROJECT_NOT_FOUND',
        msg,
        {
          reason: AGENT_REASON.NOT_FOUND,
          next: [
            {
              command: buildCommandWithGlobalFlags(client.argv, 'project ls'),
              when: 'List projects in the current team to pick a name',
            },
          ],
        }
      );
    }

    return {
      teamId: team.id,
      teamSlug: team.slug,
      projectId: projectResult.id,
      projectName: projectResult.name,
    };
  }

  const linkedProject = await getLinkedProject(client);
  if (linkedProject.status === 'error') {
    return linkedProject.exitCode;
  }

  if (linkedProject.status === 'not_linked') {
    const msg =
      'No linked project found. Run `vercel link` to link a project, or pass --project <name>.';
    return emitVcrScopeError(client, opts.jsonOutput, 'NOT_LINKED', msg, {
      reason: AGENT_REASON.NOT_LINKED,
      hint: 'Agents should pass --project when no .vercel link exists in --cwd.',
      next: [
        {
          command: buildCommandWithGlobalFlags(client.argv, 'link'),
          when: 'Link this directory to a Vercel project',
        },
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            'vcr ls --project <name_or_id>'
          ),
          when: 'List repositories for a project without linking (replace <name_or_id>)',
        },
      ],
    });
  }

  return {
    teamId: linkedProject.org.id,
    teamSlug: linkedProject.org.slug,
    projectId: linkedProject.project.id,
    projectName: linkedProject.project.name,
  };
}
