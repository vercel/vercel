import type Client from '../../util/client';
import { getLinkedProject } from '../../util/projects/link';
import getProjectByIdOrName from '../../util/projects/get-project-by-id-or-name';
import output from '../../output-manager';

export default async function status(
  client: Client,
  _args: string[],
  flags: { '--project'?: string; '--format'?: string }
): Promise<number> {
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

  const [webRes, speedRes] = await Promise.all([
    client
      .fetch<{
        isEnabled: boolean;
        hasData?: boolean;
        enabledAt?: number;
      }>(`/web/insights/enabled?projectId=${encodeURIComponent(projectId)}`)
      .catch(() => null),
    client
      .fetch<{
        isEnabled: boolean;
        isLegacyEnabled?: boolean;
        hasData?: boolean;
      }>(`/speed-insights/enabled?projectId=${encodeURIComponent(projectId)}`)
      .catch(() => null),
  ]);

  const result = {
    project: { id: project.id, name: project.name },
    webAnalytics: webRes
      ? {
          enabled: webRes.isEnabled,
          hasData: webRes.hasData,
          enabledAt: webRes.enabledAt,
        }
      : { enabled: false, error: 'Unable to fetch' },
    speedInsights: speedRes
      ? {
          enabled: speedRes.isEnabled || speedRes.isLegacyEnabled || false,
          hasData: speedRes.hasData,
        }
      : { enabled: false, error: 'Unable to fetch' },
  };

  if (flags['--format'] === 'json') {
    output.print(JSON.stringify(result, null, 2));
    return 0;
  }

  output.print(`Project: ${result.project.name} (${result.project.id})\n`);
  output.print(
    `  Web Analytics:    ${result.webAnalytics.enabled ? 'enabled' : 'disabled'}${result.webAnalytics.hasData ? ' (has data)' : ''}`
  );
  output.print(
    `  Speed Insights:   ${result.speedInsights.enabled ? 'enabled' : 'disabled'}${result.speedInsights.hasData ? ' (has data)' : ''}`
  );
  return 0;
}
