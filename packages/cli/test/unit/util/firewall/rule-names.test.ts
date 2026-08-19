import { describe, expect, it } from 'vitest';
import { resolveRuleDisplayName } from '../../../../src/util/firewall/rule-names';
import { createConfig, createRule } from '../../../mocks/firewall';

describe('resolveRuleDisplayName', () => {
  it('uses the custom rule name from the active config', () => {
    const config = createConfig({ rules: [createRule(1)] });
    expect(resolveRuleDisplayName('rule_001', config)).toEqual('Test Rule 1');
  });

  it('formats IP blocks, omitting * hostnames', () => {
    const config = createConfig({
      ips: [
        { id: 'ip_star', ip: '1.2.3.4', hostname: '*', action: 'deny' },
        {
          id: 'ip_host',
          ip: '10.0.0.1',
          hostname: 'example.com',
          action: 'deny',
        },
      ],
    });
    expect(resolveRuleDisplayName('ip_star', config)).toEqual(
      'IP Block 1.2.3.4'
    );
    expect(resolveRuleDisplayName('ip_host', config)).toEqual(
      'IP Block example.com 10.0.0.1'
    );
  });

  it('maps well-known system and managed ids', () => {
    expect(resolveRuleDisplayName('sys_dos_mitigation')).toEqual(
      'DDoS Mitigation'
    );
    expect(resolveRuleDisplayName('ip_blocking')).toEqual('IP Blocking');
    expect(resolveRuleDisplayName('challenge_mode')).toEqual('Attack Mode');
    expect(resolveRuleDisplayName('managed_bot_protection')).toEqual(
      'Bot Protection'
    );
    expect(resolveRuleDisplayName('managed_bot_filter')).toEqual(
      'Bot Protection'
    );
    expect(resolveRuleDisplayName('owasp_sqli_detection')).toEqual(
      'OWASP SQL Injection Detection'
    );
  });

  it('title-cases unknown managed_ ids', () => {
    expect(resolveRuleDisplayName('managed_ai_bots')).toEqual('Ai Bots');
  });

  it('falls back to the raw id', () => {
    expect(resolveRuleDisplayName('rule_unknown')).toEqual('rule_unknown');
  });
});
