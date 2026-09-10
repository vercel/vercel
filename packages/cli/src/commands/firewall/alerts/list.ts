import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { alertsListSubcommand } from '../command';
import {
  parseSubcommandArgs,
  outputJson,
  failFirewall,
  failFirewallApi,
} from '../shared';
import { requireProjectContext } from '../../../util/projects/require-project-context';
import {
  alertOverlapsWindow,
  FIREWALL_ACTIVITY_PLAN_MESSAGE,
  FIREWALL_ALERTS_PARTIAL_ERROR_MESSAGE,
  getFirewallAlertsDetailed,
} from '../../../util/firewall/get-firewall-alerts';
import {
  formatAlertsList,
  splitAlertSections,
} from '../../../util/firewall/format-alerts';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import {
  validateTimeBound,
  validateTimeOrder,
} from '../../../util/command-validation';

export default async function list(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    alertsListSubcommand,
    client,
    'alerts list'
  );
  if (typeof parsed === 'number') return parsed;

  const sinceResult = validateTimeBound(parsed.flags['--since']);
  if (!sinceResult.valid) {
    return failFirewall(client, {
      message: sinceResult.message,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
    });
  }
  const untilResult = validateTimeBound(parsed.flags['--until']);
  if (!untilResult.valid) {
    return failFirewall(client, {
      message: untilResult.message,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
    });
  }
  const order = validateTimeOrder(sinceResult.value, untilResult.value);
  if (!order.valid) {
    return failFirewall(client, {
      message: order.message,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
    });
  }

  const to = untilResult.value ?? new Date();
  const from =
    sinceResult.value ?? new Date(to.getTime() - 24 * 60 * 60 * 1000);

  const link = await requireProjectContext(
    client,
    'firewall',
    parsed.flags['--project']
  );
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;
  if (!teamId) {
    return failFirewall(client, {
      message:
        'Firewall alerts need a team. Run `vercel switch` to select a team or pass --scope <team>.',
      reason: AGENT_REASON.MISSING_SCOPE,
    });
  }

  const asJson = Boolean(parsed.flags['--json']);
  const suggestedCommand = `firewall alerts list${asJson ? ' --json' : ''}`;

  output.spinner(`Fetching firewall alerts for ${chalk.bold(project.name)}`);

  try {
    const fetched = await getFirewallAlertsDetailed(client, {
      projectId: project.id,
      teamId,
      from,
      to,
    });
    const bothFailed = Boolean(fetched.o11y && fetched.attackStatus);
    const planIssue = [fetched.o11y, fetched.attackStatus].find(
      issue => issue?.reason === 'plan'
    );
    const sourceError = [fetched.o11y, fetched.attackStatus].find(
      issue => issue?.reason === 'error'
    );

    // No source answered and at least one of them broke, so there is nothing
    // to report and no way to say the window was quiet. Gating this on the
    // o11y source alone let a plan-gated o11y plus a 500 from attack-status
    // print an empty table under the upgrade notice — naming a billing state
    // as the reason for a failure that was not one.
    if (bothFailed && sourceError) {
      return failFirewall(client, {
        message: planIssue
          ? `${sourceError.message.replace(/\.$/, '')}. ${planIssue.message}`
          : sourceError.message,
        nextCommand: suggestedCommand,
        reason: AGENT_REASON.API_ERROR,
      });
    }

    const inWindow = fetched.alerts.filter(alert =>
      alertOverlapsWindow(alert, from.getTime(), to.getTime())
    );
    const sections = splitAlertSections(inWindow);

    if (asJson) {
      outputJson(client, {
        ...sections,
        ...(planIssue
          ? {
              activityUnavailable: {
                reason: 'plan' as const,
                message: FIREWALL_ACTIVITY_PLAN_MESSAGE,
              },
            }
          : {}),
        ...(sourceError
          ? {
              alertsUnavailable: {
                reason: 'error' as const,
                message: sourceError.message,
              },
            }
          : {}),
      });
      return 0;
    }

    output.print(`\n${formatAlertsList({ ...sections, from, to })}`);
    if (planIssue) {
      output.print(`  ${FIREWALL_ACTIVITY_PLAN_MESSAGE}\n`);
    } else if (sourceError) {
      output.print(`  ${FIREWALL_ALERTS_PARTIAL_ERROR_MESSAGE}\n`);
    }
    output.print('\n');
    return 0;
  } catch (e: unknown) {
    return failFirewallApi(client, e, {
      fallback: 'Failed to fetch firewall alerts',
      nextCommand: suggestedCommand,
      permissionAction: 'read firewall alerts',
      projectName: project.name,
      timeoutJob: 'firewall alerts',
    });
  }
}
