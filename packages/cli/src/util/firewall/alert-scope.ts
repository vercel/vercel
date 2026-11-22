import type Client from '../client';
import { eqFilter } from './dimensions';
import {
  findFirewallAlert,
  type FirewallAlertRow,
} from './get-firewall-alerts';
import { RULE_ID_DIMENSION } from './get-firewall-traffic';

/** The alert id resolved to nothing, which a retry cannot fix. */
export class AlertNotFoundError extends Error {
  constructor(alertId: string) {
    super(
      `No firewall alert found for "${alertId}". Run \`vercel firewall alerts list\` to view recent alerts.`
    );
    this.name = 'AlertNotFoundError';
  }
}

export interface AlertScope {
  alert: FirewallAlertRow;
  startTime: Date;
  endTime: Date;
  /** Restricts traffic to the alert's rule, when it names one. */
  filter?: string;
}

/**
 * The window and rule one alert covers, so `--alert` can point a traffic
 * query at the episode `firewall alerts inspect` just described.
 *
 * Scoped by rule rather than by action: the rule id is one value on one
 * dimension, where an action has more spellings than the alert carries
 * (`challenge` also lands as solved and failed rows). Requests by Action then
 * splits the rule's traffic anyway, which is the more useful answer.
 *
 * An unresolved alert has no end, so the window runs to now.
 */
export async function resolveAlertScope(
  client: Client,
  opts: { alertId: string; projectId: string; teamId: string }
): Promise<AlertScope> {
  const resolved = await findFirewallAlert(client, opts);
  if (!resolved) {
    throw new AlertNotFoundError(opts.alertId);
  }
  const { alert } = resolved;
  return {
    alert,
    startTime: new Date(alert.startedAt),
    endTime: new Date(alert.resolvedAt ?? Date.now()),
    filter: alert.ruleId
      ? eqFilter(RULE_ID_DIMENSION, alert.ruleId)
      : undefined,
  };
}
