import chalk from 'chalk';
import type Client from '../../util/client';
import { requireProjectContext } from '../../util/projects/require-project-context';
import output from '../../output-manager';
import { alertsSubcommand } from './command';
import { parseSubcommandArgs, outputJson, withGlobalFlags } from './shared';
import { getFirewallAlerts } from '../../util/firewall/get-firewall-alerts';
import { formatAlertsOutput } from '../../util/firewall/format-overview';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { isAPIError } from '../../util/errors-ts';

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
  if (org.type !== 'team') {
    const msg =
      'Firewall alerts require a team scope. Run `vercel switch` to select a team.';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: msg,
        next: [{ command: withGlobalFlags(client, 'switch') }],
      });
      process.exit(1);
      return 1;
    }
    output.error(msg);
    return 1;
  }

  const teamId = org.id;
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
    let msg =
      e instanceof Error ? e.message : 'Failed to fetch firewall alerts';
    if (isAPIError(e) && (e.status === 401 || e.status === 403)) {
      msg =
        'You do not have permission to read firewall alerts for this project. Check team access and try again.';
    }
    if (
      e instanceof Error &&
      (e.name === 'TimeoutError' || e.name === 'AbortError')
    ) {
      msg =
        'Timed out waiting for firewall alerts. Re-run the command — the next try is usually faster.';
    }
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [{ command: withGlobalFlags(client, 'firewall alerts') }],
      });
      process.exit(1);
      return 1;
    }
    output.error(msg);
    return 1;
  } finally {
    output.stopSpinner();
  }
}
