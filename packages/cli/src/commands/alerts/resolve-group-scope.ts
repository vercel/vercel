import type Client from '../../util/client';
import { getLinkedProject } from '../../util/projects/link';
import { resolveRulesTeam } from '../monitors/parse-scope';
import {
  type AlertsScope,
  resolveAlertsScope,
  scopeFromLinkedProject,
} from './resolve-alerts-scope';

/**
 * Resolves the scope for a command that targets one alert group by ID:
 * `--project` or `--all` when given, else the linked project, else the team.
 */
export async function resolveGroupScope(
  client: Client,
  opts: {
    project?: string;
    all?: boolean;
    jsonOutput: boolean;
    command?: string;
  }
): Promise<AlertsScope | number> {
  if (opts.project || opts.all) {
    return resolveAlertsScope(client, opts);
  }

  const linkedProject = await getLinkedProject(client);
  if (linkedProject.status === 'error') {
    return linkedProject.exitCode;
  }
  if (linkedProject.status === 'linked') {
    return scopeFromLinkedProject(linkedProject);
  }

  // Alert group IDs are unique within a team, and the API looks them up by
  // team alone, so an unlinked directory only needs a team scope.
  return resolveRulesTeam(client, opts.jsonOutput);
}
