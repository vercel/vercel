import type Client from '../../../util/client';
import type { Org } from '@vercel-internals/types';
import { failFirewall } from '../shared';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import {
  validateTimeBound,
  validateTimeOrder,
} from '../../../util/command-validation';
import {
  TRAFFIC_DIMENSIONS,
  andFilters,
  dimensionAliases,
  eqFilter,
  type TrafficDimension,
} from '../../../util/firewall/dimensions';
import type { AlertScope } from '../../../util/firewall/alert-scope';
import {
  FILTER_DEPRECATION_WARNING,
  usesODataSyntax,
} from '../../../util/metrics/filter-syntax';
import output from '../../../output-manager';

/** Matches `firewall alerts list` and the overview's activity block. */
export const DEFAULT_TRAFFIC_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Traffic comes from team-scoped observability, so a personal account cannot
 * answer any of it — unlike the configuration commands, which can.
 */
export function requireTrafficTeam(
  client: Client,
  org: Org,
  what: string
): string | number {
  if (org.type === 'team') return org.id;
  return failFirewall(client, {
    message: `${what} needs a team. Run \`vercel switch\` to select a team or pass --scope <team>.`,
    reason: AGENT_REASON.MISSING_SCOPE,
  });
}

/**
 * The window to query: explicit bounds first, then the alert `--alert` names,
 * then the last day.
 *
 * Explicit bounds win over the alert so a caller can widen the window around
 * an episode — the anomaly is rarely the whole story, and its own window is
 * often minutes long.
 */
export function resolveTrafficWindow(
  since: string | undefined,
  until: string | undefined,
  scope?: AlertScope
):
  | { valid: true; startTime: Date; endTime: Date }
  | { valid: false; message: string } {
  const sinceResult = validateTimeBound(since);
  if (!sinceResult.valid) return { valid: false, message: sinceResult.message };
  const untilResult = validateTimeBound(until);
  if (!untilResult.valid) return { valid: false, message: untilResult.message };
  const order = validateTimeOrder(sinceResult.value, untilResult.value);
  if (!order.valid) return { valid: false, message: order.message };

  if (!sinceResult.value && !untilResult.value && scope) {
    return { valid: true, startTime: scope.startTime, endTime: scope.endTime };
  }

  const endTime = untilResult.value ?? new Date();
  const startTime =
    sinceResult.value ??
    scope?.startTime ??
    new Date(endTime.getTime() - DEFAULT_TRAFFIC_WINDOW_MS);
  // `validateTimeOrder` above compares the two flags only when both are given,
  // so an inverted window can still reach here two ways, and each names a
  // different argument. Without this the API answers a generic 400 that says
  // neither. The default start is a day before `endTime` and cannot invert.
  if (startTime.getTime() > endTime.getTime()) {
    return {
      valid: false,
      message: sinceResult.value
        ? // `--since` alone, dated after `endTime`. A relative offset is always
          // in the past, so this is an ISO date in the future — which nothing
          // upstream rejects.
          '`--since` is in the future. Pass a past time, such as `24h` or an earlier date.'
        : // No `--since`, so the start came from the alert, and the alert began
          // after the `--until` the caller did give.
          'The alert began after `--until`. Widen the window with `--since`, or drop `--until`.',
    };
  }
  return { valid: true, startTime, endTime };
}

/**
 * One KQL filter from the `--ip`-style dimension flags and any raw
 * `--query` expressions, ANDed together the way `vercel metrics` does.
 *
 * Raw expressions go in verbatim: the Observability API validates them, and
 * rewriting them here would only disagree with what it accepts. An OData one
 * is still passed on rather than rejected — the API is the authority on what
 * it accepts — but it is worth saying which syntax is being read.
 */
export function buildTrafficFilter(
  flags: Record<string, unknown>
): string | undefined {
  const parts: Array<string | undefined> = [];
  for (const dimension of TRAFFIC_DIMENSIONS) {
    const value = flags[`--${dimension.alias}`];
    if (typeof value === 'string' && value.length > 0) {
      parts.push(eqFilter(dimension.field, value));
    }
  }
  const raw = flags['--query'];
  const rawExpressions: string[] = [];
  if (Array.isArray(raw)) {
    for (const expression of raw) {
      if (typeof expression === 'string' && expression.length > 0) {
        rawExpressions.push(expression);
        parts.push(expression);
      }
    }
  }
  if (usesODataSyntax(rawExpressions)) {
    output.warn(FILTER_DEPRECATION_WARNING);
  }
  return andFilters(...parts);
}

export function unknownDimensionMessage(flag: string, value: string): string {
  return `Unknown ${flag} "${value}". Dimensions: ${dimensionAliases().join(', ')}.`;
}

const WAF_ONLY_ALIASES = new Set(['action', 'rule']);

function hasStringFlag(flags: Record<string, unknown>, flag: string): boolean {
  const value = flags[flag];
  return typeof value === 'string' && value.length > 0;
}

function requestCountFilterFlags(flags: Record<string, unknown>): string[] {
  return TRAFFIC_DIMENSIONS.filter(
    d => d.metric && hasStringFlag(flags, `--${d.alias}`)
  ).map(d => `--${d.alias}`);
}

/**
 * The two traffic metrics do not share a schema. `unknown-bot` is request
 * counts (`botCategory`, `botVerified`); everything else is firewall
 * actions (`wafAction`, `wafRuleId`). Mixing them is a 400 from the API
 * rather than an empty report, so refuse before the query.
 *
 * `list` always charts firewall actions, so a request-count filter is
 * invalid even when `--dimension unknown-bot` is the only panel asked for.
 */
export function mixedTrafficMetricError(opts: {
  flags: Record<string, unknown>;
  dimension?: TrafficDimension;
  groupBy?: TrafficDimension;
}): string | undefined {
  const requestFilters = requestCountFilterFlags(opts.flags);
  const queryingRequestCount = Boolean(opts.dimension?.metric);

  if (!queryingRequestCount && requestFilters.length > 0) {
    return `Can't combine ${requestFilters.join(', ')} with firewall-action data. Inspect unknown-bot <category> instead.`;
  }

  if (!queryingRequestCount || !opts.dimension) return undefined;

  const unsupported: string[] = [];
  if (hasStringFlag(opts.flags, '--action')) unsupported.push('--action');
  if (hasStringFlag(opts.flags, '--rule')) unsupported.push('--rule');
  if (opts.groupBy && WAF_ONLY_ALIASES.has(opts.groupBy.alias)) {
    unsupported.push(`--group-by ${opts.groupBy.alias}`);
  }

  if (unsupported.length === 0) return undefined;
  return `${opts.dimension.label} uses request-count data and cannot be combined with ${unsupported.join(', ')}. Use a request dimension such as path, ip, host, country, asn, ja4, or user-agent instead.`;
}

/** Bounded so a top list stays scannable and the query stays cheap. */
export const TOP_LIMITS = { min: 1, max: 100 } as const;

/**
 * How many buckets a trend can spend, from the terminal it is printed to: a
 * sparkline is one character per bucket, and it shares its row with a label
 * and three number columns.
 */
export function trendBuckets(client: Client): number {
  const columns = client.stderr.columns || 80;
  return Math.max(12, Math.min(96, columns - 56));
}

/**
 * Run tasks with a ceiling on how many are in flight.
 *
 * Each top list is its own observability query, and firing all of them at
 * once is how a wide report gets rate limited or times out together.
 */
export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    async () => {
      while (next < tasks.length) {
        const index = next++;
        results[index] = await tasks[index]();
      }
    }
  );
  await Promise.all(workers);
  return results;
}
