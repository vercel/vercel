import { randomUUID } from 'node:crypto';
import type Client from '../../util/client';
import type { AgentApi } from './api';
import type { AgentContext } from './context';
import getScope from '../../util/get-scope';
import { getLinkedProject } from '../../util/projects/link';
import { createAgentApi, sessionUrl } from './api';
import { currentGitBranch } from './context';
import { AgentError, toAgentError } from './errors';

/** Everything needed to talk to one session. */
export interface Target {
  client: Client;
  api: AgentApi;
  context: AgentContext;
  session: { id: string; isNew: boolean };
  url: string;
}

export interface TargetOptions {
  /** `--project`: project name or id, instead of the linked project. */
  project?: string;
  /** `--session`: an existing session id. */
  session?: string;
  /** `--continue`: the most recent session on the team. */
  continue?: boolean;
}

export function newSession(): Target['session'] {
  return {
    id: randomUUID(),
    isNew: true,
  };
}

async function pickSession(
  api: AgentApi,
  teamId: string,
  options: TargetOptions
): Promise<Target['session']> {
  if (options.session) return { id: options.session, isNew: false };
  if (options.continue) {
    const [latest] = (await api.listSessions(teamId)).items;
    if (!latest)
      throw new AgentError(
        'not_found',
        'No previous session to continue on this team.'
      );
    return { id: latest.id, isNew: false };
  }
  return newSession();
}

/**
 * The team (`--scope`, else the linked project's team, else the current team), the project
 * (`--project`, else the linked project when it belongs to that team), and the session.
 */
export async function resolveTarget(
  client: Client,
  options: TargetOptions
): Promise<Target> {
  try {
    const { team } = await getScope(client, { resolveLocalScope: true });
    if (!team)
      throw new AgentError(
        'missing_scope',
        'Vercel Agent needs a team. Pass --scope <team>.'
      );
    let project: AgentContext['project'];
    if (options.project) {
      const found = await client.fetch<{ id: string; name: string }>(
        `/v9/projects/${encodeURIComponent(options.project)}`,
        { accountId: team.id }
      );
      project = { id: found.id, slug: found.name };
    } else {
      const link = await getLinkedProject(client);
      if (link.status === 'linked' && link.org.id === team.id)
        project = { id: link.project.id, slug: link.project.name };
    }
    const api = createAgentApi(client);
    const context: AgentContext = {
      team: { id: team.id, slug: team.slug },
      project,
      branch: currentGitBranch(client.cwd),
    };
    const session = await pickSession(api, team.id, options);
    return {
      client,
      api,
      context,
      session,
      url: sessionUrl(team.slug, session.id),
    };
  } catch (error) {
    throw toAgentError(error);
  }
}
