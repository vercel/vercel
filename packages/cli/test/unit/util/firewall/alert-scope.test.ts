import { describe, expect, it } from 'vitest';
import {
  actionFilter,
  buildAlertScopeFilter,
  findFirewallAlert,
} from '../../../../src/util/firewall/alert-scope';
import type { FirewallAlertRow } from '../../../../src/util/firewall/get-firewall-alerts';

function alert(partial: Partial<FirewallAlertRow>): FirewallAlertRow {
  return {
    id: 'al_1',
    title: 'Alert',
    type: 'firewallCustomRule_anomaly',
    startedAt: 1,
    ...partial,
  };
}

describe('alert-scope', () => {
  it('expands challenge into outcome variants', () => {
    expect(actionFilter('challenge')).toEqual(
      "waf_action in ('challenge', 'challenge-failed', 'challenge-solved')"
    );
  });

  it('maps rate_limit to the hyphenated waf_action', () => {
    expect(actionFilter('rate_limit')).toEqual("waf_action eq 'rate-limit'");
  });

  it('builds an action+rule filter and omits host', () => {
    expect(
      buildAlertScopeFilter(
        alert({
          action: 'deny',
          ruleId: 'sys_dos_mitigation',
          host: 'vercel.com',
        })
      )
    ).toEqual(
      "(waf_action eq 'deny') and (waf_rule_id eq 'sys_dos_mitigation')"
    );
  });

  it('finds an unambiguous id prefix', () => {
    const alerts = [
      alert({ id: 'al_ec2e8c92-1653-4910-ac6c-4a431f08db4d' }),
      alert({ id: 'al_ffff0000-0000-0000-0000-000000000000' }),
    ];
    expect(findFirewallAlert(alerts, 'al_ec2e8c92')?.id).toEqual(
      'al_ec2e8c92-1653-4910-ac6c-4a431f08db4d'
    );
    expect(findFirewallAlert(alerts, 'al_')).toBeUndefined();
  });
});
