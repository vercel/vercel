import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { persistentActionsListSubcommand } from '../command';
import {
  parseSubcommandArgs,
  outputJson,
  failFirewall,
  failFirewallApi,
  failFirewallObservabilityPlan,
} from '../shared';
import { requireProjectContext } from '../../../util/projects/require-project-context';
import {
  clampPersistentActionWindow,
  fetchFirewallPersistentActions,
  retentionLabel,
} from '../../../util/firewall/get-firewall-events';
import { fetchPlanInfo } from '../../../util/firewall/interactive-helpers';
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
  // Read before the flags are: a relative `--since` resolves against the
  // clock, and so does the plan's retention boundary further down. Both are
  // measured from here so the two agree.
  const startedAt = Date.now();
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

  const requested = persistentActionWindow(
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

  // The API trims the start of the window to the plan's retention without
  // saying so, so ask what the plan is and report the window the rows
  // actually cover.
  const { isEnterprise, known } = await fetchPlanInfo(client);
  const window = clampPersistentActionWindow({
    ...requested,
    isEnterprise,
    planKnown: known,
    now: startedAt,
  });
  const { from, to } = window;
  if (window.empty) {
    return failFirewall(client, {
      message: `This plan keeps ${retentionLabel(isEnterprise)} of persistent-action history, and the requested window is entirely older than that. Narrow it with --since and --until.`,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
    });
  }
  if (window.requestedFrom && !asJson) {
    output.warn(
      `This plan keeps ${retentionLabel(isEnterprise)} of persistent-action history. Showing from ${from.toISOString()} rather than ${window.requestedFrom.toISOString()}.`
    );
  }

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
          // Only when they differ, so a caller can tell a trimmed window
          // from one the plan covered in full.
          ...(window.requestedFrom
            ? {
                requestedStartTime: window.requestedFrom.toISOString(),
                trimmedToPlanRetention: true as const,
              }
            : {}),
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
      return failFirewallObservabilityPlan(client, e, project.name);
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
