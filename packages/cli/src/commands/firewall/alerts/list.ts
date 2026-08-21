import chalk from 'chalk';
import type Client from '../../../util/client';
import { requireProjectContext } from '../../../util/projects/require-project-context';
import output from '../../../output-manager';
import { alertsSubcommand } from '../command';
import {
  parseSubcommandArgs,
  outputJson,
  requireFirewallTeam,
  failFirewallApi,
} from '../shared';
import { getFirewallAlerts } from '../../../util/firewall/get-firewall-alerts';
import { formatAlertsOutput } from '../../../util/firewall/format-overview';

export default async function alerts(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, alertsSubcommand, client);
  if (typeof parsed === 'number') return parsed;

  const link = await requireProjectContext(
    client,
    'firewall',
    parsed.flags['--project']
  );
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = requireFirewallTeam(client, org, 'Firewall alerts');
  if (typeof teamId === 'number') return teamId;

  output.spinner(`Fetching firewall alerts for ${chalk.bold(project.name)}`);

  try {
    const { active, resolved, all, attacksMitigated } = await getFirewallAlerts(
      client,
      {
        projectId: project.id,
        teamId,
        sinceDays: 1,
      }
    );

    if (parsed.flags['--json']) {
      outputJson(client, {
        active,
        resolved,
        attacksMitigated,
        all,
      });
      return 0;
    }

    output.print(formatAlertsOutput({ active, resolved }));
    return 0;
  } catch (e: unknown) {
    return failFirewallApi(client, e, {
      fallback: 'Failed to fetch firewall alerts',
      nextCommand: 'firewall alerts',
      permissionAction: 'read firewall alerts',
      projectName: project.name,
      timeoutJob: 'firewall alerts',
    });
  } finally {
    output.stopSpinner();
  }
}
