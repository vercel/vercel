import type Client from '../client';
import { resolveTimeRange } from '../time-utils';
import { andFilters, eqFilter } from './dimensions';
import {
  getFirewallAlerts,
  type FirewallAlertRow,
} from './get-firewall-alerts';

export const SYS_DOS_MITIGATION_RULE_ID = 'sys_dos_mitigation';

export class AlertNotFoundError extends Error {
  readonly alertId: string;

  constructor(alertId: string) {
    super(
      `No firewall alert found with id "${alertId}". Run \`vercel firewall alerts\` to list alert ids.`
    );
    this.name = 'AlertNotFoundError';
    this.alertId = alertId;
  }
}

export interface AlertScope {
  alert: FirewallAlertRow;
  startTime: Date;
  endTime: Date;
  filter: string | undefined;
}

/** OData filter matching the alert's firewall action, including challenge outcomes. */
export function actionFilter(action?: string): string | undefined {
  if (!action) return undefined;
  if (action === 'challenge') {
    return "waf_action in ('challenge', 'challenge-failed', 'challenge-solved')";
  }
  if (action === 'rate_limit') {
    return eqFilter('waf_action', 'rate-limit');
  }
  return eqFilter('waf_action', action);
}

export function findFirewallAlert(
  alerts: FirewallAlertRow[],
  id: string
): FirewallAlertRow | undefined {
  const exact = alerts.find(a => a.id === id);
  if (exact) return exact;
  const matches = alerts.filter(a => a.id.startsWith(id));
  return matches.length === 1 ? matches[0] : undefined;
}

/** Anomaly-window filter: action + rule. Host is left to `--host`. */
export function buildAlertScopeFilter(
  alert: FirewallAlertRow
): string | undefined {
  return andFilters(
    actionFilter(alert.action),
    alert.ruleId ? eqFilter('waf_rule_id', alert.ruleId) : undefined
  );
}

export async function resolveAlertScope(
  client: Client,
  opts: { alertId: string; projectId: string; teamId: string }
): Promise<AlertScope> {
  const alerts = await getFirewallAlerts(client, {
    projectId: opts.projectId,
    teamId: opts.teamId,
    sinceDays: 7,
  });
  const alert = findFirewallAlert(alerts.all, opts.alertId);
  if (!alert) {
    throw new AlertNotFoundError(opts.alertId);
  }
  return {
    alert,
    startTime: new Date(alert.startedAt),
    endTime: new Date(alert.resolvedAt ?? Date.now()),
    filter: buildAlertScopeFilter(alert),
  };
}

/**
 * `--alert` supplies the anomaly window. Explicit `--since` / `--until`
 * override it. Without `--alert`, default `--since` is `defaultSince`.
 */
export function resolveScopedTimeRange(opts: {
  scope?: AlertScope;
  since?: string;
  until?: string;
  defaultSince?: string;
}): { startTime: Date; endTime: Date } {
  const defaultSince = opts.defaultSince ?? '1d';
  if (opts.since || opts.until) {
    return resolveTimeRange(
      opts.since ??
        (opts.scope ? opts.scope.startTime.toISOString() : defaultSince),
      opts.until
    );
  }
  if (opts.scope) {
    return { startTime: opts.scope.startTime, endTime: opts.scope.endTime };
  }
  return resolveTimeRange(defaultSince, undefined);
}
