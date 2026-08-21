import { resolveRuleDisplayName } from './rule-names';
import type { FirewallConfigResponse, FirewallIpRule } from './types';

export type AttributedPersistentActionKind =
  | 'custom_rule'
  | 'ip_block'
  | 'managed';

export interface AttributedPersistentActionRule {
  id: string;
  name: string;
  kind: AttributedPersistentActionKind;
}

export interface PersistentActionRuleActivity {
  ruleId: string;
  total: number;
}

/**
 * Join a persistent-action row to a rule the way the dashboard blocked-IP
 * banner does: config IP blocks + observability `waf_rule_id` hits, and only
 * when exactly one user-owned (or managed) candidate remains.
 *
 * System mitigations are never attributed. The events API does not return a
 * rule id — Tinybird `firewall_actions_by_project_v2` drops `internal_ref_id`
 * and `rule` from its final SELECT. Surfacing those columns would make this
 * join unnecessary.
 */
export function attributePersistentActionRule(opts: {
  actionType: string;
  publicIp: string;
  customRules: Array<{ id: string; name: string }>;
  ipRules: FirewallIpRule[];
  ruleActivity: PersistentActionRuleActivity[];
  config?: FirewallConfigResponse | null;
}): AttributedPersistentActionRule | undefined {
  if (opts.actionType === 'system-action') return undefined;

  const customById = new Map(opts.customRules.map(r => [r.id, r]));
  const ipById = new Map(opts.ipRules.map(r => [r.id, r]));
  const candidates = new Map<string, AttributedPersistentActionRule>();

  for (const ipRule of opts.ipRules) {
    if (ipRule.ip !== opts.publicIp) continue;
    candidates.set(ipRule.id, {
      id: ipRule.id,
      name: 'IP Blocking',
      kind: 'ip_block',
    });
  }

  for (const row of opts.ruleActivity) {
    if (!row.ruleId || row.total <= 0) continue;
    if (row.ruleId.startsWith('sys_')) continue;

    const custom = customById.get(row.ruleId);
    if (custom) {
      candidates.set(custom.id, {
        id: custom.id,
        name: custom.name,
        kind: 'custom_rule',
      });
      continue;
    }

    const ip = ipById.get(row.ruleId);
    if (ip) {
      candidates.set(ip.id, {
        id: ip.id,
        name: 'IP Blocking',
        kind: 'ip_block',
      });
      continue;
    }

    if (row.ruleId.startsWith('managed_')) {
      candidates.set(row.ruleId, {
        id: row.ruleId,
        name: resolveRuleDisplayName(row.ruleId, opts.config),
        kind: 'managed',
      });
    }
  }

  if (candidates.size !== 1) return undefined;
  return [...candidates.values()][0];
}
