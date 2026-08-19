import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

const ROLLUP = 'vercel_firewall_action_count_sum';
const NOW = Date.now();
const STARTED_AT = NOW - 30 * 60_000;

let emptyTopIps = false;

function mockAlertDetailApis(capturedBodies: any[]) {
  client.scenario.get('/alerts/v3/groups', (_req: any, res: any) => {
    res.json([
      {
        id: 'group_1',
        alerts: [
          {
            id: 'alert_deny_1',
            title: 'Firewall Custom Rule Anomaly',
            type: 'firewallCustomRule_anomaly',
            startedAt: STARTED_AT,
            data: { count: 45_000, action: 'deny', ruleId: 'rule_1' },
          },
        ],
      },
    ]);
  });

  client.scenario.get(
    '/v1/security/firewall/attack-status',
    (_req: any, res: any) => {
      res.json({ anomalies: [] });
    }
  );

  client.scenario.post('/v2/observability/query', (req: any, res: any) => {
    const body = req.body ?? {};
    capturedBodies.push(body);
    const groupBy: string[] = body.groupBy ?? [];

    if (groupBy[0] === 'client_ip') {
      if (emptyTopIps) {
        res.json({ summary: [], data: [], statistics: {} });
        return;
      }
      res.json({
        summary: [
          { client_ip: '160.119.71.90', [ROLLUP]: 3_600 },
          { client_ip: '165.22.56.65', [ROLLUP]: 1_600 },
        ],
        data: [],
        statistics: {},
      });
      return;
    }

    if (groupBy[0] === 'request_hostname') {
      res.json({
        summary: [{ request_hostname: 'vercel.com', [ROLLUP]: 5_000 }],
        data: [],
        statistics: {},
      });
      return;
    }

    // Chart timeseries: quiet baseline bucket, hot anomaly bucket.
    res.json({
      summary: [{ [ROLLUP]: 45_900 }],
      data: [
        {
          timestamp: new Date(STARTED_AT - 2 * 3600_000).toISOString(),
          [ROLLUP]: 900,
        },
        {
          timestamp: new Date(STARTED_AT + 5 * 60_000).toISOString(),
          [ROLLUP]: 45_000,
        },
      ],
      statistics: {},
    });
  });
}

describe('firewall alert-detail', () => {
  let capturedBodies: any[];

  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'firewall-test-project',
      name: 'firewall-test',
      accountId: 'team_dummy',
    });
    client.config.currentTeam = 'team_dummy';
    const cwd = setupUnitFixture('commands/firewall');
    client.cwd = cwd;
    capturedBodies = [];
    emptyTopIps = false;
    mockAlertDetailApis(capturedBodies);
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('firewall', 'alert-detail', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'firewall:alert-detail',
        },
      ]);
    });
  });

  it('shows alert meta, baseline comparison, and top entities', async () => {
    client.setArgv('firewall', 'alert-detail', 'alert_deny_1');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('During anomaly');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('Firewall Custom Rule Anomaly');
    expect(fullOutput).toContain('Active');
    expect(fullOutput).toMatch(/Rule:\s+rule_1/);
    expect(fullOutput).toMatch(/Action:\s+Deny/);
    expect(fullOutput).toContain('Previous 24h (avg)');
    expect(fullOutput).toContain('Anomaly window');
    expect(fullOutput).toContain('Denied IPs (during anomaly)');
    expect(fullOutput).toContain('160.119.71.90');
    expect(fullOutput).toContain('Top Hosts (during anomaly)');
    expect(fullOutput).toContain('vercel.com');
    expect(fullOutput).toContain('traffic-dashboard --alert alert_deny_1');
    expect(fullOutput).not.toContain('drill-in');
    expect(fullOutput).toContain('ip-blocks block 160.119.71.90');
    expect(fullOutput).toContain('firewall events --action deny');

    // Queries are scoped to the alert's action and rule.
    const chartQuery = capturedBodies.find(b => (b.groupBy ?? []).length === 0);
    expect(chartQuery.filter).toContain("waf_action eq 'deny'");
    expect(chartQuery.filter).toContain("waf_rule_id eq 'rule_1'");
  });

  it('errors on an unknown alert id', async () => {
    client.setArgv('firewall', 'alert-detail', 'nope');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(1);
    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('No firewall alert found with id "nope"');
  });

  it('falls back to firewall events when Top IPs is empty', async () => {
    emptyTopIps = true;
    client.scenario.get(
      '/v1/security/firewall/events',
      (_req: any, res: any) => {
        res.json({
          actions: [
            {
              startTime: new Date(STARTED_AT).toISOString(),
              endTime: new Date(STARTED_AT + 10 * 60_000).toISOString(),
              isActive: false,
              action_type: 'system-action',
              action: 'deny',
              host: 'vercel.com',
              public_ip: '104.30.175.37',
              count: 1_200,
            },
            {
              startTime: new Date(STARTED_AT).toISOString(),
              endTime: new Date(STARTED_AT + 10 * 60_000).toISOString(),
              isActive: false,
              action_type: 'system-action',
              action: 'deny',
              host: 'vercel.com',
              public_ip: '104.30.175.37',
              count: 800,
            },
            {
              startTime: new Date(STARTED_AT).toISOString(),
              endTime: new Date(STARTED_AT + 10 * 60_000).toISOString(),
              isActive: false,
              action_type: 'system-action',
              action: 'challenge',
              host: 'vercel.com',
              public_ip: '1.2.3.4',
              count: 9_000,
            },
          ],
        });
      }
    );

    client.setArgv('firewall', 'alert-detail', 'alert_deny_1');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('104.30.175.37');
    expect(fullOutput).not.toContain('1.2.3.4');
    expect(fullOutput).toContain('traffic-dashboard --alert alert_deny_1');
    expect(fullOutput).toContain('ip-blocks block 104.30.175.37');
    expect(fullOutput).not.toContain('drill-in');
  });

  it('outputs JSON with --json', async () => {
    client.setArgv('firewall', 'alert-detail', 'alert_deny_1', '--json');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    const payload = JSON.parse((client.stdout as any).getFullOutput());
    expect(payload.alert.id).toEqual('alert_deny_1');
    expect(payload.alert.action).toEqual('deny');
    expect(payload.baselineAvgPerMin).toBeGreaterThan(0);
    expect(payload.anomalyAvgPerMin).toBeGreaterThan(payload.baselineAvgPerMin);
    expect(payload.topIps[0].ip).toEqual('160.119.71.90');
    expect(payload.topHosts[0].host).toEqual('vercel.com');
  });
});
