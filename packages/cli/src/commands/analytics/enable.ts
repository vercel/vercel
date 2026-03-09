import type Client from '../../util/client';
import { getLinkedProject } from '../../util/projects/link';
import getProjectByIdOrName from '../../util/projects/get-project-by-id-or-name';
import output from '../../output-manager';

const FEATURES = ['web-analytics', 'speed-insights', 'insights'] as const;
type Feature = (typeof FEATURES)[number];

export default async function enable(
  client: Client,
  args: string[],
  flags: { '--project'?: string }
): Promise<number> {
  const feature = args[0]?.toLowerCase() as Feature | undefined;
  if (!feature || !FEATURES.includes(feature)) {
    output.error(
      `Invalid feature. Choose one of: ${FEATURES.join(', ')}. Example: vercel analytics enable web-analytics`
    );
    return 1;
  }

  let projectIdOrName = flags['--project'];
  if (!projectIdOrName) {
    const link = await getLinkedProject(client);
    if (link.status === 'error') return link.exitCode ?? 1;
    if (link.status === 'not_linked') {
      output.error(
        'No project specified. Link a project with `vercel link` or pass `--project <name-or-id>`.'
      );
      return 1;
    }
    projectIdOrName = link.project.id;
  }

  const project = await getProjectByIdOrName(client, projectIdOrName);
  if (!project || 'status' in project || !('id' in project)) {
    output.error('Project not found.');
    return 1;
  }
  const projectId = project.id;

  if (feature === 'web-analytics') {
    await client.fetch<{ value: boolean }>(
      `/web/insights/toggle?projectId=${encodeURIComponent(projectId)}`,
      { method: 'POST', body: { value: true } }
    );
    output.log('Web Analytics enabled for this project.');
    return 0;
  }

  if (feature === 'speed-insights') {
    await client.fetch<{ value: boolean }>(
      `/speed-insights/toggle?projectId=${encodeURIComponent(projectId)}`,
      { method: 'POST', body: { value: true } }
    );
    output.log('Speed Insights enabled for this project.');
    return 0;
  }

  if (feature === 'insights') {
    await client.fetch(`/insights/${encodeURIComponent(projectId)}/enable`, {
      method: 'PUT',
    });
    output.log('Insights enabled for this project.');
    return 0;
  }

  return 1;
}
