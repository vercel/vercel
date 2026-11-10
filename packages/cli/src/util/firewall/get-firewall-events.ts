import type Client from '../client';
import { andFilters, eqFilter, nonEmptyFilter } from './dimensions';

const EVENTS_TIMEOUT_MS = 20_000;
export const TOP_N = 5;

/**
 * A row as `/v1/security/firewall/events` returns it: snake_case, with
 * timestamps in `YYYY-MM-DD HH:mm:ss.SSS` rather than ISO 8601.
 *
 * `action_type` says which kind of rule acted: `system-action` for the
 * platform's own rules, anything else for one of the project's custom rules.
 * The mitigation itself — `challenge`, `deny` — is `action`. The two are
 * easily confused because a project with no custom persistent actions returns
 * `system-action` on every row, which reads like a constant.
 */
export interface FirewallEventAction {
  startTime: string;
  endTime: string;
  isActive: boolean;
  action_type: string;
  action: string;
  ruleId: string | null;
  ruleName: string | null;
  host: string;
  public_ip: string;
  count: number;
}

/** One persistent action, in the shape the CLI reports it. */
export interface PersistentAction {
  /** ISO 8601, unlike the API's own format. */
  startTime: string;
  endTime: string;
  active: boolean;
  /** The mitigation applied: `challenge`, `deny`, … */
  action: string;
  /** Which kind of rule acted, as the API names it, e.g. `system-action`. */
  actionType: string;
  /**
   * `system` for the platform's rules, `custom` for the project's own, and
   * `hidden` when the plan withheld the row's detail.
   */
  ruleType: 'system' | 'custom' | 'hidden';
  /** The plan withheld this row's hostname, IP, and rule. */
  redacted?: true;
  host: string;
  ip: string;
  requests: number;
  ruleId?: string;
  ruleName?: string;
}

/**
 * The API's timestamps are space-separated UTC with no zone
 * (`2026-09-04 12:49:15.812`), which `Date` reads as *local* time. Anything
 * comparing or displaying them without pinning the zone is silently off by
 * the machine's offset — and these get labelled UTC when displayed.
 */
export function apiTimestampMs(apiTimestamp: string): number {
  const pinned = new Date(`${apiTimestamp.replace(' ', 'T')}Z`).getTime();
  return Number.isNaN(pinned) ? new Date(apiTimestamp).getTime() : pinned;
}

function toIso(apiTimestamp: string): string {
  const ms = apiTimestampMs(apiTimestamp);
  return Number.isNaN(ms) ? apiTimestamp : new Date(ms).toISOString();
}

export function toPersistentAction(row: FirewallEventAction): PersistentAction {
  const redacted =
    isRedacted(row.action_type) ||
    isRedacted(row.public_ip) ||
    isRedacted(row.host);
  return {
    startTime: toIso(row.startTime),
    endTime: toIso(row.endTime),
    active: row.isActive,
    action: row.action,
    actionType: row.action_type,
    ruleType: isRedacted(row.action_type)
      ? 'hidden'
      : row.action_type === SYSTEM_ACTION_TYPE
        ? 'system'
        : 'custom',
    ...(redacted ? { redacted: true as const } : {}),
    host: row.host,
    ip: row.public_ip,
    requests: row.count,
    ...(row.ruleId ? { ruleId: row.ruleId } : {}),
    ...(row.ruleName ? { ruleName: row.ruleName } : {}),
  };
}

interface FirewallEventsResponse {
  actions: FirewallEventAction[];
}

/** `action_type` for the platform's own rules; anything else is a custom rule. */
export const SYSTEM_ACTION_TYPE = 'system-action';

/**
 * What the API substitutes for a field it will not serve: on the Hobby plan
 * every row older than an hour comes back with its hostname, IP, rule and
 * action type replaced by this. It is a real value in the response, so
 * anything reading those fields has to recognize it — left alone it
 * classifies as a custom rule and aggregates as though it were an address.
 */
export const REDACTED_VALUE = '***';

export function isRedacted(value: string | null | undefined): boolean {
  return value === REDACTED_VALUE;
}

export function ruleTypeLabel(actionType: string): string {
  if (isRedacted(actionType)) return 'Hidden';
  return actionType === SYSTEM_ACTION_TYPE ? 'System Rule' : 'Custom Rule';
}
/**
 * Dimensions on `vercel.firewall_action.count`, which are not the field names
 * the events API returns: a row's hostname is `host` there and
 * `requestHostname` on the metric. Filtering by the wrong one is rejected
 * outright.
 */
export const CLIENT_IP_DIMENSION = 'clientIp';
export const HOST_DIMENSION = 'requestHostname';
export const PATH_DIMENSION = 'requestPath';

/**
 * Observability filter for one persistent action's IP, and host when we have
 * it. `withPath` adds the dashboard's exclusion of rows carrying no path,
 * which is worth having on a group-by-path query: those rows can never appear
 * as a result, so scanning them is wasted.
 *
 * A redacted field is dropped rather than filtered on: `***` is the plan
 * withholding the value, and querying traffic for a client named `***` finds
 * nothing while looking like it found nothing to report.
 */
export function persistentActionFilter(opts: {
  ip: string;
  host?: string;
  withPath?: boolean;
}): string | undefined {
  return andFilters(
    isRedacted(opts.ip) ? undefined : eqFilter(CLIENT_IP_DIMENSION, opts.ip),
    opts.host && !isRedacted(opts.host)
      ? eqFilter(HOST_DIMENSION, opts.host)
      : undefined,
    opts.withPath ? nonEmptyFilter(PATH_DIMENSION) : undefined
  );
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface FirewallEventsBreakdown {
  ips: NamedCount[];
  hosts: NamedCount[];
}

function aggregateTop(
  actions: FirewallEventAction[],
  key: 'public_ip' | 'host',
  top: number,
  /** Mitigation to keep, matched against each row's `action`. */
  mitigation?: string
): NamedCount[] {
  const totals = new Map<string, number>();
  for (const action of actions) {
    if (mitigation && action.action !== mitigation) continue;
    const name = action[key];
    if (!name || isRedacted(name)) continue;
    totals.set(name, (totals.get(name) ?? 0) + action.count);
  }
  return [...totals.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, top);
}

/**
 * How far back the events API will look, by plan. It clamps `startTimestamp`
 * to this itself and says nothing about having done so, so a wider `--since`
 * comes back trimmed while the report still claims the window that was asked
 * for. Clamping here instead keeps the label, the JSON window and the rows
 * describing the same period.
 *
 * Mirrors `services/api-security/src/endpoints/get-firewall-events.ts`.
 */
export const PERSISTENT_ACTION_RETENTION_MS = {
  enterprise: 7 * 24 * 60 * 60 * 1000,
  other: 24 * 60 * 60 * 1000,
} as const;

export interface ClampedWindow {
  from: Date;
  to: Date;
  /** The start asked for, when it was older than the plan allows. */
  requestedFrom?: Date;
  /** Every requested moment is older than the plan's retention. */
  empty: boolean;
}

export function clampPersistentActionWindow(opts: {
  from: Date;
  to: Date;
  isEnterprise: boolean;
  /** False when the plan could not be read; see below. */
  planKnown?: boolean;
  /**
   * The instant the requested window was measured from. A relative `--since`
   * is resolved against `Date.now()` while the flags are parsed, and the
   * retention boundary is a second reading of the same clock — so comparing
   * the two against `Date.now()` here would find `--since 24h` older than a
   * 24-hour retention by however long the plan lookup and any project prompt
   * took, and report every default window as trimmed. Measuring both from the
   * moment the command started keeps them on one clock.
   */
  now?: number;
}): ClampedWindow {
  // Clamping on a plan that could not be read would trim an Enterprise team's
  // week to a day and name a retention limit that may not apply to it. The
  // API enforces its own either way, so leaving the window alone costs a
  // silent trim rather than a confident wrong explanation.
  if (opts.planKnown === false) {
    return { from: opts.from, to: opts.to, empty: false };
  }
  const now = opts.now ?? Date.now();
  const retentionMs = opts.isEnterprise
    ? PERSISTENT_ACTION_RETENTION_MS.enterprise
    : PERSISTENT_ACTION_RETENTION_MS.other;
  const earliest = now - retentionMs;
  if (opts.from.getTime() >= earliest) {
    return { from: opts.from, to: opts.to, empty: false };
  }
  const from = new Date(earliest);
  return {
    from,
    to: opts.to,
    requestedFrom: opts.from,
    empty: from.getTime() >= opts.to.getTime(),
  };
}

/** How the trimmed window is explained, in hours or days as it reads best. */
export function retentionLabel(isEnterprise: boolean): string {
  return isEnterprise ? '7 days' : '24 hours';
}

/**
 * Sort key for a row's start, pinned to UTC like everything else that reads
 * these timestamps. `new Date` alone reads them as local, which across a
 * spring-forward gap maps two rows an hour apart onto the same instant — the
 * newest-first comparison then ties and the count tiebreak below decides,
 * so `inspect` can call the busier of the two the most recent. A timestamp
 * neither parse can read sorts last.
 */
function startedAtMs(row: FirewallEventAction): number {
  const ms = apiTimestampMs(row.startTime);
  return Number.isNaN(ms) ? 0 : ms;
}

export interface FetchFirewallEventsOpts {
  projectId: string;
  teamId: string;
  startTime: Date;
  endTime: Date;
  host?: string;
  timeoutMs?: number;
}

/**
 * Persistent actions in the window from GET /v1/security/firewall/events.
 * Newest first. Callers classify 402 vs 5xx; this function does not swallow either.
 */
export async function fetchFirewallPersistentActions(
  client: Client,
  opts: FetchFirewallEventsOpts
): Promise<FirewallEventAction[]> {
  const query = new URLSearchParams();
  query.set('projectId', opts.projectId);
  query.set('teamId', opts.teamId);
  query.set('startTimestamp', String(opts.startTime.getTime()));
  query.set('endTimestamp', String(opts.endTime.getTime()));
  if (opts.host) query.set('hosts', opts.host);

  const timeoutMs = opts.timeoutMs ?? EVENTS_TIMEOUT_MS;
  try {
    const response = await client.fetch<FirewallEventsResponse>(
      `/v1/security/firewall/events?${query.toString()}`,
      {
        accountId: opts.teamId,
        signal: AbortSignal.timeout(timeoutMs),
      }
    );
    return [...(response.actions ?? [])].sort((a, b) => {
      const start = startedAtMs(b) - startedAtMs(a);
      if (start !== 0) return start;
      return b.count - a.count;
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === 'TimeoutError' || err.name === 'AbortError')
    ) {
      throw new Error(
        `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for firewall events. Re-run the command — the next try is usually faster.`
      );
    }
    throw err;
  }
}

/**
 * One request for denied IPs and top hosts in the anomaly window.
 * Callers classify 402 vs 5xx; this function does not swallow either.
 */
export async function getFirewallEvents(
  client: Client,
  opts: FetchFirewallEventsOpts & {
    action?: string;
    top?: number;
  }
): Promise<FirewallEventsBreakdown> {
  const actions = await fetchFirewallPersistentActions(client, opts);
  const top = opts.top ?? TOP_N;
  return {
    ips: aggregateTop(actions, 'public_ip', top, opts.action),
    hosts: aggregateTop(actions, 'host', top),
  };
}

export interface PersistentActionsSummary {
  /** Distinct IPs currently being challenged. */
  challengingIps: number;
  /** Distinct IPs currently being blocked. */
  blockingIps: number;
  /** Active actions applying something other than challenge or deny. */
  otherActions: number;
  /**
   * Active challenges and blocks against an address the plan withheld. They
   * cannot join the counts above — every withheld address reads as the same
   * `***`, so counting them as distinct clients would report one where there
   * may be hundreds — and left out entirely they are the gap between those
   * counts and `activeTotal`.
   */
  withheldActions: number;
  /** Active actions in total, counted per action rather than per IP. */
  activeTotal: number;
}

/**
 * What the firewall is enforcing right now, which is the question the list is
 * usually run to answer — reading it off the rows means scanning them.
 *
 * Counts only actions still in force, and by distinct IP rather than by row:
 * one address can hold several concurrent actions, so a row count overstates
 * how many clients are affected. Mirrors the dashboard's
 * `summarizePersistentActions`.
 */
export function summarizePersistentActions(
  actions: FirewallEventAction[]
): PersistentActionsSummary | null {
  const challenging = new Set<string>();
  const blocking = new Set<string>();
  let otherActions = 0;
  let withheldActions = 0;
  let activeTotal = 0;

  for (const action of actions) {
    if (!action.isActive) continue;
    activeTotal += 1;
    // A redacted address cannot be told apart from any other, so counting it
    // as one distinct client would report one where there may be hundreds.
    // `otherActions` is already counted per action rather than per IP, so
    // those rows can join it; a challenge or a block is set aside instead of
    // dropped, or the parts would not add up to the total beside them.
    if (isRedacted(action.public_ip)) {
      if (action.action === 'challenge' || action.action === 'deny') {
        withheldActions += 1;
      } else {
        otherActions += 1;
      }
      continue;
    }
    if (action.action === 'challenge') challenging.add(action.public_ip);
    else if (action.action === 'deny') blocking.add(action.public_ip);
    else otherActions += 1;
  }

  if (activeTotal === 0) return null;
  return {
    challengingIps: challenging.size,
    blockingIps: blocking.size,
    otherActions,
    withheldActions,
    activeTotal,
  };
}
