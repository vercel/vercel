import type Client from '../client';
import { isAPIError } from '../errors-ts';
import { labelForAction } from './format-utils';
import { apiServerMessage } from './server-message';

const FIREWALL_O11Y_ALERT_TYPES = [
  'botId_anomaly',
  'firewallSystemRule_anomaly',
  'firewallCustomRule_anomaly',
] as const;

/** `type` on the rows `mapAttackAnomaly` produces. */
export const FIREWALL_ANOMALY_TYPE = 'firewall_anomaly';

/** The system rule that mitigates DDoS, as the API names it. */
const SYS_DOS_MITIGATION_RULE_ID = 'sys_dos_mitigation';

/**
 * The o11y alert covering system rules, DDoS mitigation among them. It also
 * fires for IP blocking and attack mode, so its `data.ruleId` decides whether
 * a given alert is an attack.
 */
const SYSTEM_RULE_ANOMALY_TYPE = 'firewallSystemRule_anomaly';

export interface AttackStatusAnomaly {
  ownerId: string;
  projectId: string;
  startTime: number;
  endTime: number | null;
  atMinute: number;
  state?: string;
  affectedHostMap: Record<
    string,
    {
      ddosAlerts?: Record<string, { atMinute: string; totalReqs: number }>;
    }
  >;
}

interface AttackStatusResponse {
  anomalies: AttackStatusAnomaly[];
}

export interface FirewallAlertRow {
  id: string;
  title: string;
  type: string;
  startedAt: number;
  resolvedAt?: number;
  count?: number;
  detail?: string;
  /** Firewall action the alert fired on (deny, challenge, ...). */
  action?: string;
  ruleId?: string;
  path?: string;
  /** Primary affected hostname. */
  host?: string;
}

interface O11yAlert {
  id?: string;
  title?: string;
  type?: string;
  startedAt?: number;
  resolvedAt?: number;
  data?: {
    count?: number;
    action?: string;
    ruleId?: string;
    path?: string;
  };
}

interface O11yAlertGroup {
  id?: string;
  title?: string;
  type?: string;
  recordedStartedAt?: number;
  recordedResolvedAt?: number;
  alerts?: O11yAlert[];
}

export interface ResolvedFirewallAlert {
  alert: FirewallAlertRow;
  /** Per-host totals from legacy attack-status, when we have them. */
  hosts?: { name: string; count: number }[];
}

/** What the activity block needs, when the plan does not include it. */
export const FIREWALL_ACTIVITY_PLAN_MESSAGE =
  'Traffic and alerts need Observability Plus.';

export const FIREWALL_ALERTS_PARTIAL_ERROR_MESSAGE =
  "Couldn't load every alert source.";

export interface AlertSourceIssue {
  reason: 'plan' | 'error';
  message: string;
}

export interface FirewallAlertsFetch {
  alerts: FirewallAlertRow[];
  o11y?: AlertSourceIssue;
  attackStatus?: AlertSourceIssue;
  /**
   * The same failures again, named in a few words each. `overview` reports
   * them at the end of a line summarising everything it did read, where the
   * sentences above would not fit; empty when both sources answered.
   */
  errors: FirewallAlertSourceError[];
}

function reduceAttackAnomaly(anomaly: AttackStatusAnomaly): {
  hosts: string[];
  challenged: number;
  denied: number;
  count: number;
} {
  return Object.keys(anomaly.affectedHostMap).reduce(
    (acc, host) => {
      acc.hosts.push(host);
      const challenged =
        anomaly.affectedHostMap[host].ddosAlerts?.[
          'sys_dos_mitigation:challenge'
        ]?.totalReqs || 0;
      const denied =
        anomaly.affectedHostMap[host].ddosAlerts?.['sys_dos_mitigation:deny']
          ?.totalReqs || 0;
      acc.challenged += challenged;
      acc.denied += denied;
      acc.count += challenged + denied;
      return acc;
    },
    { hosts: [] as string[], challenged: 0, denied: 0, count: 0 }
  );
}

function hostsFromAnomaly(
  anomaly: AttackStatusAnomaly
): { name: string; count: number }[] {
  return Object.entries(anomaly.affectedHostMap)
    .map(([host, data]) => {
      const challenged =
        data.ddosAlerts?.['sys_dos_mitigation:challenge']?.totalReqs || 0;
      const denied =
        data.ddosAlerts?.['sys_dos_mitigation:deny']?.totalReqs || 0;
      return { name: host, count: challenged + denied };
    })
    .filter(row => row.count > 0)
    .sort((a, b) => b.count - a.count);
}

function mapAttackAnomaly(anomaly: AttackStatusAnomaly): FirewallAlertRow {
  const reduced = reduceAttackAnomaly(anomaly);
  const parts: string[] = ['System rule'];
  if (reduced.denied > 0) parts.push(labelForAction('deny'));
  if (reduced.challenged > 0) parts.push(labelForAction('challenge'));
  return {
    id: `${anomaly.ownerId}-${anomaly.projectId}-${anomaly.startTime}`,
    title: 'DDoS Mitigation',
    type: FIREWALL_ANOMALY_TYPE,
    startedAt: anomaly.startTime,
    resolvedAt: anomaly.endTime || undefined,
    count: reduced.count,
    detail: parts.join(' · '),
    action: reduced.denied >= reduced.challenged ? 'deny' : 'challenge',
    ruleId: SYS_DOS_MITIGATION_RULE_ID,
    host: reduced.hosts[0],
  };
}

function mapO11yAlert(alert: O11yAlert): FirewallAlertRow | null {
  if (!alert.startedAt) return null;
  const action = alert.data?.action;
  const ruleId = alert.data?.ruleId;
  const detailParts = [
    alert.type,
    action ? labelForAction(action) : undefined,
    ruleId,
  ].filter(Boolean);
  return {
    id: alert.id || `${alert.type}-${alert.startedAt}`,
    title: alert.title || alert.type || 'Firewall alert',
    type: alert.type || 'unknown',
    startedAt: alert.startedAt,
    resolvedAt: alert.resolvedAt,
    count: alert.data?.count,
    detail: detailParts.filter(p => p !== alert.title).join(' · ') || undefined,
    action,
    ruleId,
    path: alert.data?.path,
  };
}

/**
 * `since` is a lookback from *now* in whole days, not a window: the endpoint
 * answers with everything since `subDays(new Date(), since)`. It is honoured
 * only for enterprise teams — everyone else is served one day whatever they
 * ask for — and truncated to this many days, so no request can reach further
 * back than a week.
 */
const ATTACK_STATUS_MAX_DAYS = 7;

async function getAttackStatus(
  client: Client,
  opts: {
    projectId: string;
    teamId: string;
    /** Days to look back from now; see {@link ATTACK_STATUS_MAX_DAYS}. */
    sinceDays?: number;
    signal?: AbortSignal;
  }
): Promise<AttackStatusResponse> {
  const query = new URLSearchParams();
  query.set('projectId', opts.projectId);
  query.set('teamId', opts.teamId);
  if (opts.sinceDays !== undefined) {
    // Clamped here so every caller is bounded by the same cap, rather than
    // each having to know it.
    const sinceDays = Math.min(
      ATTACK_STATUS_MAX_DAYS,
      Math.max(1, Math.ceil(opts.sinceDays))
    );
    query.set('since', String(sinceDays));
  }
  return client.fetch<AttackStatusResponse>(
    `/v1/security/firewall/attack-status?${query.toString()}`,
    { accountId: opts.teamId, signal: opts.signal }
  );
}

/**
 * The endpoint returns 100 groups by default and offers no cursor, so an
 * unscoped request silently hands back the newest 100 with no way to tell that
 * was not all of them. Scoping by time keeps the cap far from the alerts we
 * report; asking for more than the default keeps a noisy day inside it.
 * Reaching this many in one window still truncates, and there is nothing to
 * page with — the only remedy would be a narrower window.
 */
const O11Y_ALERTS_LIMIT = 200;

async function getFirewallO11yAlerts(
  client: Client,
  opts: {
    projectId: string;
    teamId: string;
    /** Alerts started within `[from, to]`; the API requires ISO strings. */
    from: Date;
    to: Date;
    signal?: AbortSignal;
  }
): Promise<FirewallAlertRow[]> {
  const query = new URLSearchParams();
  query.set('teamId', opts.teamId);
  query.set('projectId', opts.projectId);
  query.set('from', opts.from.toISOString());
  query.set('to', opts.to.toISOString());
  query.set('limit', String(O11Y_ALERTS_LIMIT));
  for (const type of FIREWALL_O11Y_ALERT_TYPES) {
    query.append('types', type);
  }

  const groups = await client.fetch<O11yAlertGroup[]>(
    `/alerts/v3/groups?${query.toString()}`,
    { accountId: opts.teamId, signal: opts.signal }
  );

  return groups
    .flatMap(g => g.alerts ?? [])
    .map(mapO11yAlert)
    .filter((a): a is FirewallAlertRow => a !== null);
}

const ALERTS_TIMEOUT_MS = 20_000;

/**
 * An alert source that could not be read. Both sources feed the attack count,
 * so either one failing makes that count a floor rather than a total, and a
 * caller reporting it has to be able to say so.
 */
export interface FirewallAlertSourceError {
  source: 'alerts' | 'attackStatus';
  message: string;
}

/** Why a source failed, short enough to sit at the end of a summary line. */
function sourceFailureReason(err: unknown): string {
  if (
    (isAPIError(err) && err.status === 408) ||
    (err instanceof Error &&
      (err.name === 'TimeoutError' || err.name === 'AbortError'))
  ) {
    return 'timed out';
  }
  if (isAPIError(err) && err.status === 402) {
    return 'needs Observability Plus';
  }
  if (isAPIError(err) && typeof err.status === 'number') {
    return `HTTP ${err.status}`;
  }
  return err instanceof Error && err.message ? err.message : 'unknown error';
}

/**
 * Merge o11y firewall alerts with legacy DDoS attack-status history, unresolved
 * first and newest first within that. Callers scope the result to the window
 * they are reporting on; nothing here assumes one.
 *
 * Both DDoS sources are read, unlike the dashboard, which drops the legacy
 * history once an account has Security+ on the grounds that the alerts API
 * reports the same attacks. On vercel-site it does not: over one week the
 * alerts API had no DDoS row newer than two days, missing every attack in the
 * last day, while the legacy feed missed events the alerts API had. Where they
 * do overlap the timestamps differ by 5-10 minutes, so there is no key to join
 * on, and the alerts API also repeats rows for a single attack. Reading both
 * can therefore count one attack twice; reading only the alerts API loses
 * recent attacks outright, which is the worse failure for a security summary.
 */
function resolveAlertsWindow(opts: {
  sinceDays?: number;
  from?: Date;
  to?: Date;
}): { from: Date; to: Date; sinceDays: number } {
  const now = Date.now();
  const to = opts.to ?? new Date(now);
  const from =
    opts.from ?? new Date(to.getTime() - 86_400_000 * (opts.sinceDays ?? 1));
  // Measured from now rather than from `to`, because that is what the legacy
  // endpoint means by `since`. Deriving it from the window's *length* asked
  // for the last day whenever the caller wanted a day in the past, so every
  // DDoS alert fell outside the window the caller then filtered to — the one
  // source the comment above says must not be dropped.
  const sinceDays =
    opts.sinceDays ??
    Math.max(1, Math.ceil((now - from.getTime()) / 86_400_000));
  return { from, to, sinceDays };
}

function classifyAlertSourceError(err: unknown): AlertSourceIssue {
  if (isAPIError(err) && (err.status === 401 || err.status === 403)) {
    throw err;
  }
  if (isAPIError(err) && err.status === 402) {
    return { reason: 'plan', message: FIREWALL_ACTIVITY_PLAN_MESSAGE };
  }
  // `err.message` is only consulted for errors that did not come from the
  // API. An `APIError` builds its own message out of the same sentinel plus
  // the status — "Response Error (500)" — so falling through to it puts back
  // exactly what `apiServerMessage` just declined to report.
  const message =
    apiServerMessage(err) ||
    (!isAPIError(err) && err instanceof Error && err.message) ||
    FIREWALL_ALERTS_PARTIAL_ERROR_MESSAGE;
  return { reason: 'error', message };
}

export async function getFirewallAlertsDetailed(
  client: Client,
  opts: {
    projectId: string;
    teamId: string;
    sinceDays?: number;
    from?: Date;
    to?: Date;
    timeoutMs?: number;
  }
): Promise<FirewallAlertsFetch> {
  const { from, to, sinceDays } = resolveAlertsWindow(opts);
  const timeoutMs = opts.timeoutMs ?? ALERTS_TIMEOUT_MS;
  const signal = AbortSignal.timeout(timeoutMs);

  // One retention window: it scopes the alerts request, drops alerts resolved
  // before it, and bounds the legacy history. An alert that opened earlier and
  // is still open falls inside it, which is what lets a caller report an
  // ongoing attack that began before the window it is summarising.

  const [o11yResult, attackResult] = await Promise.allSettled([
    getFirewallO11yAlerts(client, { ...opts, from, to, signal }),
    getAttackStatus(client, { ...opts, sinceDays, signal }),
  ]);

  // Both readings of a failure come off the one classification, so they
  // cannot drift apart or disagree about which source broke.
  const errors: FirewallAlertSourceError[] = [];

  let o11yAlerts: FirewallAlertRow[] = [];
  let o11y: AlertSourceIssue | undefined;
  if (o11yResult.status === 'fulfilled') {
    o11yAlerts = o11yResult.value;
  } else {
    o11y = classifyAlertSourceError(o11yResult.reason);
    errors.push({
      source: 'alerts',
      message: sourceFailureReason(o11yResult.reason),
    });
  }

  let mappedAttacks: FirewallAlertRow[] = [];
  let attackStatus: AlertSourceIssue | undefined;
  if (attackResult.status === 'fulfilled') {
    mappedAttacks = (attackResult.value.anomalies || []).map(mapAttackAnomaly);
  } else {
    attackStatus = classifyAlertSourceError(attackResult.reason);
    errors.push({
      source: 'attackStatus',
      message: sourceFailureReason(attackResult.reason),
    });
  }

  const resolvedCutoff = from.getTime();
  const alerts = mappedAttacks
    .concat(
      o11yAlerts.filter(a => !a.resolvedAt || a.resolvedAt > resolvedCutoff)
    )
    .sort((a, b) => {
      if (!a.resolvedAt && b.resolvedAt) return -1;
      if (a.resolvedAt && !b.resolvedAt) return 1;
      return b.startedAt - a.startedAt;
    });

  return { alerts, o11y, attackStatus, errors };
}

export async function getFirewallAlerts(
  client: Client,
  opts: {
    projectId: string;
    teamId: string;
    /** Resolved-alert retention window in days (1 default, 7 enterprise). */
    sinceDays?: number;
    /** Inclusive start; wins over `sinceDays` when both are set. */
    from?: Date;
    /** Inclusive end; defaults to now. */
    to?: Date;
    timeoutMs?: number;
  }
): Promise<FirewallAlertRow[]> {
  const { alerts } = await getFirewallAlertsDetailed(client, opts);
  return alerts;
}

/**
 * One line naming what could not be read, shared by the human and `--json`
 * paths so both say the same thing about the same gap.
 */
export function alertsIncompleteMessage(
  errors: FirewallAlertSourceError[]
): string {
  const parts = errors.map(
    e => `${e.source === 'alerts' ? 'alerts' : 'attack history'} ${e.message}`
  );
  return `Attack count and alerts may be incomplete: ${parts.join('; ')}.`;
}

/**
 * DDoS anomalies that were mitigating at any point inside the window.
 *
 * The count is reported over a period, so an attack that started and ended
 * inside it still counts, as does one that began earlier and was still running
 * when the window opened. Only anomalies lying wholly outside drop out —
 * counting just the ones active right now reports 0 for a day that saw an
 * attack come and go.
 */
export function countAttacksMitigated(
  alerts: FirewallAlertRow[],
  windowStartMs: number,
  windowEndMs: number
): number {
  return alerts.filter(
    alert =>
      isAttackAlert(alert) &&
      alertOverlapsWindow(alert, windowStartMs, windowEndMs)
  ).length;
}

/**
 * Whether the alert was open at any point inside the window.
 *
 * Shared with whoever lists the alerts, so a count and the rows meant to
 * explain it cannot disagree: scoping the list to alerts *raised* in the
 * window drops one that opened earlier and is still running, leaving a count
 * with nothing behind it.
 *
 * An absent `resolvedAt` means still open, so such an alert reaches the
 * window's end however long ago it started.
 */
export function alertOverlapsWindow(
  alert: FirewallAlertRow,
  windowStartMs: number,
  windowEndMs: number
): boolean {
  return (
    alert.startedAt <= windowEndMs &&
    (alert.resolvedAt ?? Number.POSITIVE_INFINITY) >= windowStartMs
  );
}

/**
 * Whether an alert represents a mitigated attack, from either source: the
 * legacy history, whose rows are DDoS by construction, or the system-rule
 * anomaly Security+ accounts get instead. The latter also fires for IP
 * blocking and attack mode, so it only counts when it names the DDoS rule.
 */
function isAttackAlert(alert: FirewallAlertRow): boolean {
  if (alert.type === FIREWALL_ANOMALY_TYPE) return true;
  return (
    alert.type === SYSTEM_RULE_ANOMALY_TYPE &&
    alert.ruleId === SYS_DOS_MITIGATION_RULE_ID
  );
}

const O11Y_ALERT_ID_PREFIX = 'al_';
/** How far back the inspect fallback list looks when GET-by-id 404s. */
const INSPECT_FALLBACK_DAYS = 7;

function isO11yAlertId(id: string): boolean {
  return id.startsWith(O11Y_ALERT_ID_PREFIX);
}

function parseLegacyAlertStartTime(id: string): number | undefined {
  const match = id.match(/-(\d{13})$/);
  return match ? Number(match[1]) : undefined;
}

function daysCovering(startMs: number, endMs: number): number {
  return Math.max(1, Math.ceil((endMs - startMs) / 86_400_000));
}

function mapGroupAsAlert(
  group: O11yAlertGroup,
  alertId: string
): FirewallAlertRow | null {
  const nested = (group.alerts ?? [])
    .map(mapO11yAlert)
    .filter((a): a is FirewallAlertRow => a !== null);
  const hit = nested.find(a => a.id === alertId) ?? nested[0];
  if (hit) return hit;
  const startedAt = group.recordedStartedAt;
  if (!startedAt) return null;
  return mapO11yAlert({
    id: alertId,
    title: group.title,
    type: group.type,
    startedAt,
    resolvedAt: group.recordedResolvedAt,
    data: group.alerts?.[0]?.data,
  });
}

async function getO11yAlertById(
  client: Client,
  opts: {
    projectId: string;
    teamId: string;
    alertId: string;
    signal?: AbortSignal;
  }
): Promise<FirewallAlertRow | null> {
  const query = new URLSearchParams();
  query.set('teamId', opts.teamId);
  query.set('projectId', opts.projectId);
  try {
    const group = await client.fetch<O11yAlertGroup>(
      `/alerts/v3/groups/${encodeURIComponent(opts.alertId)}?${query.toString()}`,
      { accountId: opts.teamId, signal: opts.signal }
    );
    return mapGroupAsAlert(group, opts.alertId);
  } catch (err) {
    if (isAPIError(err) && err.status === 404) return null;
    throw err;
  }
}

/**
 * Resolve one firewall alert without listing traffic. `al_*` goes to the
 * o11y group endpoint first; legacy attack-status ids are reconstructed
 * from `/attack-status`. Unknown shapes try both.
 */
export async function findFirewallAlert(
  client: Client,
  opts: {
    projectId: string;
    teamId: string;
    alertId: string;
    timeoutMs?: number;
  }
): Promise<ResolvedFirewallAlert | null> {
  const timeoutMs = opts.timeoutMs ?? ALERTS_TIMEOUT_MS;
  // Every request gets its own budget. These run in sequence, so one signal
  // shared between them lets a slow first call abort the second before it
  // starts — and the second's `catch` reports that as "no alert found",
  // which reads as an answer rather than as the timeout it is.
  const budget = () => AbortSignal.timeout(timeoutMs);
  const now = Date.now();

  if (isO11yAlertId(opts.alertId)) {
    const fromGroup = await getO11yAlertById(client, {
      ...opts,
      signal: budget(),
    });
    if (fromGroup) return { alert: fromGroup };

    const from = new Date(now - 86_400_000 * INSPECT_FALLBACK_DAYS);
    const listed = await getFirewallO11yAlerts(client, {
      projectId: opts.projectId,
      teamId: opts.teamId,
      from,
      to: new Date(now),
      signal: budget(),
    });
    const hit = listed.find(a => a.id === opts.alertId);
    return hit ? { alert: hit } : null;
  }

  const startTime = parseLegacyAlertStartTime(opts.alertId);
  const sinceDays = startTime
    ? daysCovering(startTime, now) + 1
    : INSPECT_FALLBACK_DAYS;
  const attackStatus = await getAttackStatus(client, {
    projectId: opts.projectId,
    teamId: opts.teamId,
    sinceDays,
    signal: budget(),
  }).catch(err => {
    if (isAPIError(err) && (err.status === 401 || err.status === 403)) {
      throw err;
    }
    return { anomalies: [] } as AttackStatusResponse;
  });

  const anomaly = (attackStatus.anomalies || []).find(
    a => `${a.ownerId}-${a.projectId}-${a.startTime}` === opts.alertId
  );
  if (anomaly) {
    return {
      alert: mapAttackAnomaly(anomaly),
      hosts: hostsFromAnomaly(anomaly),
    };
  }

  const fromGroup = await getO11yAlertById(client, {
    ...opts,
    signal: budget(),
  }).catch(err => {
    if (isAPIError(err) && (err.status === 401 || err.status === 403)) {
      throw err;
    }
    return null;
  });
  return fromGroup ? { alert: fromGroup } : null;
}
