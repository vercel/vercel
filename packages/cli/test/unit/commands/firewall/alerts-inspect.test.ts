import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useFirewallActivity,
  firewallActivity,
  createAttackAnomaly,
  createO11yFirewallAlert,
  FIREWALL_ROLLUP_COLUMN,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

const ALERT_ID = 'al_d6a51174-2729-4871-b662-d6ae5089f151';
const STARTED = Date.UTC(2026, 7, 21, 3, 0, 0);
const RESOLVED = Date.UTC(2026, 7, 21, 4, 0, 0);

function o11yGroup(id = ALERT_ID) {
  return {
    id,
    alerts: [
      createO11yFirewallAlert({
        id,
        startedAt: STARTED,
        resolvedAt: RESOLVED,
        count: 134_500,
        action: 'deny',
      }),
    ],
  };
}

describe('firewall alerts inspect', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'firewall-test-project',
      name: 'firewall-test',
    });
    client.cwd = setupUnitFixture('commands/firewall');
    useFirewallActivity({
      alertGroups: { [ALERT_ID]: o11yGroup() },
      series: [
        {
          timestamp: new Date(STARTED - 3_600_000).toISOString(),
          waf_action: 'allow',
          value: 3_600,
        },
        {
          timestamp: new Date(STARTED).toISOString(),
          waf_action: 'allow',
          value: 10_200,
        },
        {
          timestamp: new Date(STARTED).toISOString(),
          waf_action: 'deny',
          value: 134_500,
        },
      ],
      events: [
        {
          startTime: new Date(STARTED).toISOString(),
          endTime: new Date(RESOLVED).toISOString(),
          isActive: false,
          action_type: 'system-action',
          action: 'deny',
          ruleId: null,
          ruleName: null,
          host: 'vercel.com',
          public_ip: '13.201.227.145',
          count: 107_300,
        },
        {
          startTime: new Date(STARTED).toISOString(),
          endTime: new Date(RESOLVED).toISOString(),
          isActive: false,
          action_type: 'system-action',
          action: 'deny',
          ruleId: null,
          ruleName: null,
          host: 'no-sni.vercel-infra.com',
          public_ip: '93.123.109.205',
          count: 68_600,
        },
      ],
    });
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('firewall', 'alerts', 'inspect', '--help');
      expect(await firewall(client)).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:alerts', value: 'alerts' },
        { key: 'flag:help', value: 'firewall:alerts:inspect' },
      ]);
    });
  });

  it('requires an alert id', async () => {
    client.setArgv('firewall', 'alerts', 'inspect');
    expect(await firewall(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain('Alert id is required');
  });

  it('inspects an o11y alert and issues one metrics query', async () => {
    client.setArgv('firewall', 'alerts', 'inspect', ALERT_ID);
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('DDoS Mitigation');
    expect(await exitCodePromise).toEqual(0);

    const out = client.stderr.getFullOutput();
    expect(out).toContain('Resolved');
    expect(out).toContain('sys_dos_mitigation');
    expect(out).toContain('134.5k');
    expect(out).toContain('Denied IPs (during anomaly)');
    expect(out).toContain('13.201.227.145');
    expect(out).toContain('Top Hosts (during anomaly)');
    expect(out).toContain('vercel.com');
    expect(out).toContain('15m each');

    expect(firewallActivity.groupRequests).toEqual([ALERT_ID]);
    expect(firewallActivity.queries).toHaveLength(1);
    expect(firewallActivity.queries[0].granularity).toEqual({ minutes: 15 });
    expect(firewallActivity.queries[0].groupBy).toEqual(['waf_action']);
  });

  it('inspects a legacy attack-status id', async () => {
    const anomaly = createAttackAnomaly({
      startTime: STARTED,
      endTime: RESOLVED,
      denied: 134_500,
      host: 'vercel.com',
    });
    useFirewallActivity({
      anomalies: [anomaly],
      series: [
        {
          timestamp: new Date(STARTED).toISOString(),
          waf_action: 'deny',
          [FIREWALL_ROLLUP_COLUMN]: 134_500,
          value: 134_500,
        },
      ],
    });
    const legacyId = `team_dummy-firewall-test-project-${STARTED}`;

    client.setArgv('firewall', 'alerts', 'inspect', legacyId);
    expect(await firewall(client)).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain('DDoS Mitigation');
    expect(client.stderr.getFullOutput()).toContain('vercel.com');
    expect(firewallActivity.queries).toHaveLength(1);
  });

  it('filters the denied-IP breakdown when the alert names no action', async () => {
    // An o11y alert can arrive without `data.action`. The chart and the rates
    // read that as `deny`; leaving the breakdown unfiltered aggregated every
    // mitigation under a table still titled "Denied IPs".
    const id = 'al_no_action';
    useFirewallActivity({
      alertGroups: {
        [id]: {
          id,
          alerts: [
            {
              id,
              title: 'DDoS Mitigation',
              type: 'firewallSystemRule_anomaly',
              startedAt: STARTED,
              resolvedAt: RESOLVED,
              data: { ruleId: 'sys_dos_mitigation', count: 134_500 },
            },
          ],
        },
      },
      events: [
        {
          startTime: new Date(STARTED).toISOString(),
          endTime: new Date(RESOLVED).toISOString(),
          isActive: false,
          action_type: 'system-action',
          action: 'deny',
          ruleId: null,
          ruleName: null,
          host: 'vercel.com',
          public_ip: '13.201.227.145',
          count: 107_300,
        },
        {
          startTime: new Date(STARTED).toISOString(),
          endTime: new Date(RESOLVED).toISOString(),
          isActive: false,
          action_type: 'system-action',
          action: 'challenge',
          ruleId: null,
          ruleName: null,
          host: 'vercel.com',
          public_ip: '93.123.109.205',
          count: 68_600,
        },
      ],
    });

    client.setArgv('firewall', 'alerts', 'inspect', id);
    expect(await firewall(client)).toEqual(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('Denied IPs (during anomaly)');
    expect(out).toContain('13.201.227.145');
    expect(out).not.toContain('93.123.109.205');
  });

  it('names missing hosts when the anomaly carried none either', async () => {
    // `hostsFromAnomaly` drops hosts with no requests against them, so a
    // legacy anomaly can resolve to an empty array rather than to nothing —
    // and an empty array renders no table.
    const anomaly = createAttackAnomaly({
      startTime: STARTED,
      endTime: RESOLVED,
      host: 'vercel.com',
    });
    useFirewallActivity({
      anomalies: [anomaly],
      series: [
        {
          timestamp: new Date(STARTED).toISOString(),
          waf_action: 'deny',
          [FIREWALL_ROLLUP_COLUMN]: 134_500,
          value: 134_500,
        },
      ],
    });
    firewallActivity.eventsStatus = 500;

    client.setArgv(
      'firewall',
      'alerts',
      'inspect',
      `team_dummy-firewall-test-project-${STARTED}`
    );
    expect(await firewall(client)).toEqual(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain("Couldn't load denied IPs and hosts.");
    expect(out).not.toContain('Top Hosts (during anomaly)');
  });

  it('returns not found for an unknown id', async () => {
    client.setArgv('firewall', 'alerts', 'inspect', 'al_missing');
    expect(await firewall(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'No firewall alert found for "al_missing"'
    );
    expect(client.stderr.getFullOutput()).toContain('firewall alerts list');
  });

  it('prints the plan note when metrics are 402, and still shows the header', async () => {
    firewallActivity.queryStatus = 402;
    client.setArgv('firewall', 'alerts', 'inspect', ALERT_ID);
    expect(await firewall(client)).toEqual(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('DDoS Mitigation');
    expect(out).toContain('Traffic and alerts need Observability Plus.');
    expect(out).not.toContain('Previous 24h');
  });

  it('does not treat events 5xx as a plan gate', async () => {
    firewallActivity.eventsStatus = 500;
    client.setArgv('firewall', 'alerts', 'inspect', ALERT_ID);
    expect(await firewall(client)).toEqual(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('DDoS Mitigation');
    expect(out).toContain("Couldn't load denied IPs and hosts.");
    expect(out).not.toContain('Observability Plus');
    expect(out).toContain('Previous 24h');
  });

  it('reports JSON shape and 402 as activityUnavailable', async () => {
    client.setArgv('firewall', 'alerts', 'inspect', ALERT_ID, '--json');
    expect(await firewall(client)).toEqual(0);
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json.alert.id).toEqual(ALERT_ID);
    expect(json.status).toEqual('resolved');
    expect(json.timeseries.granularity).toEqual({ minutes: 15 });
    expect(json.deniedIps[0].ip).toEqual('13.201.227.145');
    expect(json.topHosts[0].host).toEqual('vercel.com');
    expect(json.activityUnavailable).toBeUndefined();
  });

  it('puts events 5xx on JSON as eventsUnavailable', async () => {
    firewallActivity.eventsStatus = 503;
    client.setArgv('firewall', 'alerts', 'inspect', ALERT_ID, '--json');
    expect(await firewall(client)).toEqual(0);
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json.eventsUnavailable.reason).toEqual('error');
    expect(json.deniedIps).toBeNull();
    expect(json.timeseries).not.toBeNull();
  });
});
