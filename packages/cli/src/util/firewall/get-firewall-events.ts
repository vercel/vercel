import type Client from '../client';

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
  /** `system` for the platform's rules, `custom` for the project's own. */
  ruleType: 'system' | 'custom';
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
  return {
    startTime: toIso(row.startTime),
    endTime: toIso(row.endTime),
    active: row.isActive,
    action: row.action,
    actionType: row.action_type,
    ruleType: row.action_type === SYSTEM_ACTION_TYPE ? 'system' : 'custom',
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

export function ruleTypeLabel(actionType: string): string {
  return actionType === SYSTEM_ACTION_TYPE ? 'System Rule' : 'Custom Rule';
}
/**
 * Dimensions on `vercel.firewall_action.count`, which are not the field names
 * the events API returns: a row's hostname is `host` there and
 * `request_hostname` on the metric. Filtering by the wrong one is rejected
 * outright — `"host" ... is not a supported dimension`.
 */
export const CLIENT_IP_DIMENSION = 'client_ip';
export const HOST_DIMENSION = 'request_hostname';
export const PATH_DIMENSION = 'request_path';

function odataEq(field: string, value: string): string {
  return `${field} eq '${value.replace(/'/g, "''")}'`;
}

/**
 * Observability filter for one persistent action's IP, and host when we have
 * it. `withPath` adds the dashboard's exclusion of rows carrying no path,
 * which is worth having on a group-by-path query: those rows can never appear
 * as a result, so scanning them is wasted.
 */
export function persistentActionFilter(opts: {
  ip: string;
  host?: string;
  withPath?: boolean;
}): string {
  const parts = [odataEq(CLIENT_IP_DIMENSION, opts.ip)];
  if (opts.host) parts.push(odataEq(HOST_DIMENSION, opts.host));
  if (opts.withPath) parts.push(`${PATH_DIMENSION} ne ''`);
  return parts.map(part => `(${part})`).join(' and ');
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
    if (!name) continue;
    totals.set(name, (totals.get(name) ?? 0) + action.count);
  }
  return [...totals.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, top);
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
  let activeTotal = 0;

  for (const action of actions) {
    if (!action.isActive) continue;
    activeTotal += 1;
    if (action.action === 'challenge') challenging.add(action.public_ip);
    else if (action.action === 'deny') blocking.add(action.public_ip);
    else otherActions += 1;
  }

  if (activeTotal === 0) return null;
  return {
    challengingIps: challenging.size,
    blockingIps: blocking.size,
    otherActions,
    activeTotal,
  };
}
