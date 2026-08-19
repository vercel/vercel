import type Client from '../client';

export const FIREWALL_O11Y_ALERT_TYPES = [
  'botId_anomaly',
  'firewallSystemRule_anomaly',
  'firewallCustomRule_anomaly',
] as const;

export type FirewallO11yAlertType = (typeof FIREWALL_O11Y_ALERT_TYPES)[number];

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

export interface AttackStatusResponse {
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
  alerts?: O11yAlert[];
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

function mapAttackAnomaly(anomaly: AttackStatusAnomaly): FirewallAlertRow {
  const reduced = reduceAttackAnomaly(anomaly);
  const parts: string[] = ['System rule'];
  if (reduced.denied > 0) parts.push('Deny');
  if (reduced.challenged > 0) parts.push('Challenge');
  return {
    id: `${anomaly.ownerId}-${anomaly.projectId}-${anomaly.startTime}`,
    title: 'DDoS Mitigation',
    type: 'firewall_anomaly',
    startedAt: anomaly.startTime,
    resolvedAt: anomaly.endTime || undefined,
    count: reduced.count,
    detail: parts.join(' · '),
    action: reduced.denied >= reduced.challenged ? 'deny' : 'challenge',
    ruleId: 'sys_dos_mitigation',
    host: reduced.hosts[0],
  };
}

function mapO11yAlert(alert: O11yAlert): FirewallAlertRow | null {
  if (!alert.startedAt) return null;
  const action = alert.data?.action;
  const ruleId = alert.data?.ruleId;
  const detailParts = [alert.type, action, ruleId].filter(Boolean);
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

export async function getAttackStatus(
  client: Client,
  opts: {
    projectId: string;
    teamId: string;
    sinceDays?: number;
    signal?: AbortSignal;
  }
): Promise<AttackStatusResponse> {
  const query = new URLSearchParams();
  query.set('projectId', opts.projectId);
  query.set('teamId', opts.teamId);
  if (opts.sinceDays !== undefined) {
    query.set('since', String(opts.sinceDays));
  }
  return client.fetch<AttackStatusResponse>(
    `/v1/security/firewall/attack-status?${query.toString()}`,
    { accountId: opts.teamId, signal: opts.signal }
  );
}

export async function getFirewallO11yAlerts(
  client: Client,
  opts: { projectId: string; teamId: string; signal?: AbortSignal }
): Promise<FirewallAlertRow[]> {
  const query = new URLSearchParams();
  query.set('teamId', opts.teamId);
  query.set('projectId', opts.projectId);
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

export function emptyFirewallAlerts(): {
  active: FirewallAlertRow[];
  resolved: FirewallAlertRow[];
  all: FirewallAlertRow[];
  attacksMitigated: number;
} {
  return { active: [], resolved: [], all: [], attacksMitigated: 0 };
}

/**
 * Merge o11y firewall alerts with legacy DDoS attack-status history.
 * Mirrors dashboard `useFirewallAlerts` active/resolved split.
 */
export async function getFirewallAlerts(
  client: Client,
  opts: {
    projectId: string;
    teamId: string;
    /** Resolved-alert retention window in days (1 default, 7 enterprise). */
    sinceDays?: number;
    includeAttackHistory?: boolean;
    timeoutMs?: number;
  }
): Promise<{
  active: FirewallAlertRow[];
  resolved: FirewallAlertRow[];
  all: FirewallAlertRow[];
  attacksMitigated: number;
}> {
  const sinceDays = opts.sinceDays ?? 1;
  const includeAttackHistory = opts.includeAttackHistory ?? true;
  const timeoutMs = opts.timeoutMs ?? ALERTS_TIMEOUT_MS;
  const signal = AbortSignal.timeout(timeoutMs);

  const [o11yAlerts, attackStatus] = await Promise.all([
    getFirewallO11yAlerts(client, { ...opts, signal }).catch(
      () => [] as FirewallAlertRow[]
    ),
    includeAttackHistory
      ? getAttackStatus(client, { ...opts, sinceDays, signal }).catch(
          () => ({ anomalies: [] }) as AttackStatusResponse
        )
      : Promise.resolve({ anomalies: [] } as AttackStatusResponse),
  ]);

  const mappedAttacks = (attackStatus.anomalies || []).map(mapAttackAnomaly);
  const resolvedCutoff = Date.now() - 86_400_000 * sinceDays;

  const all = mappedAttacks
    .concat(
      o11yAlerts.filter(a => !a.resolvedAt || a.resolvedAt > resolvedCutoff)
    )
    .sort((a, b) => {
      if (!a.resolvedAt && b.resolvedAt) return -1;
      if (a.resolvedAt && !b.resolvedAt) return 1;
      return b.startedAt - a.startedAt;
    });

  const active = all.filter(a => !a.resolvedAt);
  const resolved = all.filter(a => Boolean(a.resolvedAt));

  // Active DDoS anomalies count as "attacks mitigated"
  const attacksMitigated = mappedAttacks.filter(a => !a.resolvedAt).length;

  return { active, resolved, all, attacksMitigated };
}
