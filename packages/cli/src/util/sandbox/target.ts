import type Client from '../client';
import getScope from '../get-scope';
import { getLinkedProject } from '../projects/link';

function resolveToken(client: Client): string | undefined {
  return client.authConfig.token ?? process.env.VERCEL_AUTH_TOKEN;
}

export async function resolveSandboxTarget(
  client: Client,
  opts: { project?: string; team?: string } = {}
): Promise<{ token: string; teamId: string; projectId: string }> {
  const token = resolveToken(client);
  if (!token) {
    throw new Error(
      'Not authenticated. Run `vercel login` or set `VERCEL_TOKEN`.'
    );
  }

  let teamId = opts.team;
  if (!teamId) {
    const scope = await getScope(client);
    teamId = scope.team?.id;
  }

  let projectId = opts.project;
  if (!projectId) {
    const link = await getLinkedProject(client);
    if (link.status === 'linked') {
      projectId = link.project.id;
    }
  }

  if (!teamId || !projectId) {
    throw new Error(
      'Could not determine team/project scope. Pass `--scope` and `--project`, or run `vercel link`.'
    );
  }

  return { token, teamId, projectId };
}
