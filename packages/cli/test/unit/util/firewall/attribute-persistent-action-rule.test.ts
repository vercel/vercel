import { describe, expect, it } from 'vitest';
import { attributePersistentActionRule } from '../../../../src/util/firewall/attribute-persistent-action-rule';
import type { FirewallIpRule } from '../../../../src/util/firewall/types';

const ipRules: FirewallIpRule[] = [
  {
    id: 'ip_001',
    ip: '203.0.113.18',
    hostname: '*',
    action: 'deny',
  },
];

describe('attributePersistentActionRule', () => {
  it('never attributes a system mitigation', () => {
    expect(
      attributePersistentActionRule({
        actionType: 'system-action',
        publicIp: '203.0.113.18',
        customRules: [{ id: 'rule_001', name: 'Block probes' }],
        ipRules,
        ruleActivity: [{ ruleId: 'rule_001', total: 12 }],
      })
    ).toBeUndefined();
  });

  it('attributes a custom rule when it is the only candidate', () => {
    expect(
      attributePersistentActionRule({
        actionType: 'custom-action',
        publicIp: '203.0.113.18',
        customRules: [{ id: 'rule_001', name: 'Block probes' }],
        ipRules: [],
        ruleActivity: [{ ruleId: 'rule_001', total: 12 }],
      })
    ).toEqual({
      id: 'rule_001',
      name: 'Block probes',
      kind: 'custom_rule',
    });
  });

  it('stays unnamed when several custom rules match', () => {
    expect(
      attributePersistentActionRule({
        actionType: 'custom-action',
        publicIp: '203.0.113.18',
        customRules: [
          { id: 'rule_001', name: 'Block probes' },
          { id: 'rule_002', name: 'Rate limit login' },
        ],
        ipRules: [],
        ruleActivity: [
          { ruleId: 'rule_001', total: 12 },
          { ruleId: 'rule_002', total: 4 },
        ],
      })
    ).toBeUndefined();
  });

  it('attributes an IP block from config when the IP matches', () => {
    expect(
      attributePersistentActionRule({
        actionType: 'custom-action',
        publicIp: '203.0.113.18',
        customRules: [],
        ipRules,
        ruleActivity: [],
      })
    ).toEqual({
      id: 'ip_001',
      name: 'IP Blocking',
      kind: 'ip_block',
    });
  });
});
