import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { persistentActionsListSubcommand } from '../command';
import {
  parseSubcommandArgs,
  outputJson,
  failFirewall,
  failFirewallApi,
} from '../shared';
import { requireProjectContext } from '../../../util/projects/require-project-context';
import { FIREWALL_ACTIVITY_PLAN_MESSAGE } from '../../../util/firewall/get-firewall-alerts';
import { fetchFirewallPersistentActions } from '../../../util/firewall/get-firewall-events';
import {
  DEFAULT_PERSISTENT_ACTION_LIMIT,
  formatPersistentActionsList,
  persistentActionWindow,
} from '../../../util/firewall/format-persistent-actions';
import {
  toPersistentAction,
  summarizePersistentActions,
} from '../../../util/firewall/get-firewall-events';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import { isAPIError } from '../../../util/errors-ts';
import {
  validateIntegerRangeWithDefault,
  validateTimeBound,
  validateTimeOrder,
} from '../../../util/command-validation';

export default async function list(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    persistentActionsListSubcommand,
    client,
    'persistent-actions list'
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
  const limitResult = validateIntegerRangeWithDefault(
    parsed.flags['--limit'] as number | undefined,
    {
      flag: '--limit',
      min: 1,
      max: 10_000,
      defaultValue: DEFAULT_PERSISTENT_ACTION_LIMIT,
    }
  );
  if (!limitResult.valid) {
    return failFirewall(client, {
      message: limitResult.message,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
    });
  }

  const { from, to } = persistentActionWindow(
    sinceResult.value,
    untilResult.value
  );

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
        'Firewall persistent actions need a team. Run `vercel switch` to select a team or pass --scope <team>.',
      reason: AGENT_REASON.MISSING_SCOPE,
    });
  }

  const asJson = Boolean(parsed.flags['--json']);
  const suggestedCommand = `firewall persistent-actions list${asJson ? ' --json' : ''}`;

  output.spinner(`Fetching persistent actions for ${chalk.bold(project.name)}`);

  try {
    const actions = await fetchFirewallPersistentActions(client, {
      projectId: project.id,
      teamId,
      startTime: from,
      endTime: to,
    });
    const shown = actions.slice(0, limitResult.value);
    // Over the whole window, not the page: a page of ten would report ten.
    const summary = summarizePersistentActions(actions);

    if (asJson) {
      outputJson(client, {
        window: {
          startTime: from.toISOString(),
          endTime: to.toISOString(),
        },
        // Mapped rather than passed through: the API answers in snake_case
        // with timestamps `Date` cannot be trusted to parse, and this is a
        // contract the rest of the family reads in camelCase and ISO.
        actions: shown.map(toPersistentAction),
        shown: shown.length,
        total: actions.length,
        summary,
      });
      return 0;
    }

    output.print(
      `\n${formatPersistentActionsList({
        actions: shown,
        total: actions.length,
        summary,
        from,
        to,
      })}\n`
    );
    return 0;
  } catch (e: unknown) {
    if (isAPIError(e) && e.status === 402) {
      return failFirewall(client, {
        message: FIREWALL_ACTIVITY_PLAN_MESSAGE,
        reason: AGENT_REASON.API_ERROR,
      });
    }
    return failFirewallApi(client, e, {
      fallback: 'Failed to fetch persistent firewall actions',
      nextCommand: suggestedCommand,
      permissionAction: 'read firewall persistent actions',
      projectName: project.name,
      timeoutJob: 'firewall persistent actions',
    });
  }
}
