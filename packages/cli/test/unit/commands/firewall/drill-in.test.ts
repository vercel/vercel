import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

const ROLLUP = 'vercel_firewall_action_count_sum';

function mockDrillInApis(capturedBodies: any[]) {
  const now = Date.now();
  client.scenario.post('/v2/observability/query', (req: any, res: any) => {
    const body = req.body ?? {};
    capturedBodies.push(body);
    const groupBy: string[] = body.groupBy ?? [];

    if (groupBy.includes('asn_name')) {
      // Drill-in header detail for an IP.
      res.json({
        summary: [
          {
            asn_name: 'Amazon.com, Inc.',
            asn_id: '16509',
            client_ip_country: 'US',
            [ROLLUP]: 117_500,
          },
        ],
        data: [],
        statistics: {},
      });
      return;
    }

    if (groupBy.length === 0) {
      // Entity timeseries.
      res.json({
        summary: [{ [ROLLUP]: 117_500 }],
        data: [
          {
            timestamp: new Date(now - 2 * 3600_000).toISOString(),
            [ROLLUP]: 100,
          },
          {
            timestamp: new Date(now - 1 * 3600_000).toISOString(),
            [ROLLUP]: 500,
          },
        ],
        statistics: {},
      });
      return;
    }

    // Breakdown table for whatever group-by field was requested.
    const field = groupBy[0];
    res.json({
      summary: [
        { [field]: `/${field}/top`, [ROLLUP]: 81_900 },
        { [field]: `/${field}/second`, [ROLLUP]: 42 },
      ],
      data: [
        {
          timestamp: new Date(now - 1 * 3600_000).toISOString(),
          [field]: `/${field}/top`,
          [ROLLUP]: 100,
        },
      ],
      statistics: {},
    });
  });
}

describe('firewall traffic inspect', () => {
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
    mockDrillInApis(capturedBodies);
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('firewall', 'traffic', 'inspect', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'firewall:traffic:inspect',
        },
      ]);
    });
  });

  it('shows entity header, timeseries, and default breakdown', async () => {
    client.setArgv('firewall', 'traffic', 'inspect', 'ip', '52.53.157.118');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Breakdown by Request Path');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('52.53.157.118');
    expect(fullOutput).toContain('IP Address');
    expect(fullOutput).toContain('AS Name');
    expect(fullOutput).toContain('Amazon.com, Inc.');
    expect(fullOutput).toMatch(/Requests\s+117\.5k/);
    expect(fullOutput).toContain('/request_path/top');
    expect(fullOutput).toContain(
      'firewall rules add "Block 52.53.157.118" --condition \'{"type":"ip_address","op":"eq","value":"52.53.157.118"}\' --action deny'
    );
    expect(fullOutput).toContain('Group by something else');
    expect(fullOutput).not.toContain('firewall bot-management');

    // Entity filter applied to every query.
    for (const body of capturedBodies) {
      expect(body.filter).toContain("client_ip eq '52.53.157.118'");
    }
  });

  it('honors --group-by', async () => {
    client.setArgv(
      'firewall',
      'traffic',
      'inspect',
      'ip',
      '52.53.157.118',
      '--group-by',
      'user-agent'
    );
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Breakdown by User Agent');
    expect(await exitCodePromise).toEqual(0);

    const breakdownQuery = capturedBodies.find(b =>
      (b.groupBy ?? []).includes('client_user_agent')
    );
    expect(breakdownQuery).toBeDefined();
  });

  it('suggests editing the inspected rule', async () => {
    client.setArgv(
      'firewall',
      'traffic',
      'inspect',
      'rule',
      'rule_inc_5723_PAkIBS'
    );
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Firewall Rule');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('firewall rules edit rule_inc_5723_PAkIBS');
    expect(fullOutput).toContain('Group by something else');
    expect(fullOutput).not.toContain('firewall rules add');
  });

  it('maps managed bot rule ids to reserved slugs', async () => {
    client.setArgv(
      'firewall',
      'traffic',
      'inspect',
      'rule',
      'managed_bot_protection'
    );
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Firewall Rule');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('firewall rules edit bot-protection');
    expect(fullOutput).not.toContain(
      'firewall rules edit managed_bot_protection'
    );
  });

  it('sends bot inspect to the bot-management grouping', async () => {
    client.setArgv('firewall', 'traffic', 'inspect', 'bot', 'amazonbot');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Bot');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('amazonbot');
    expect(fullOutput).toContain('firewall bot-management');
    expect(fullOutput).not.toContain('firewall rules edit amazonbot');
    expect(fullOutput).not.toContain('firewall rules add');
  });

  it('rejects an unknown dimension', async () => {
    client.setArgv('firewall', 'traffic', 'inspect', 'flavor', 'vanilla');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(1);
    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('Unknown dimension "flavor"');
  });

  it('outputs JSON with --json', async () => {
    client.setArgv(
      'firewall',
      'traffic',
      'inspect',
      'ip',
      '52.53.157.118',
      '--json'
    );
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    const payload = JSON.parse((client.stdout as any).getFullOutput());
    expect(payload.dimension).toEqual('ip');
    expect(payload.value).toEqual('52.53.157.118');
    expect(payload.total).toEqual(117_500);
    expect(payload.detail.asn_name).toEqual('Amazon.com, Inc.');
    expect(payload.breakdown.groupBy).toEqual('path');
    expect(payload.breakdown.groups[0].total).toEqual(81_900);
  });

  describe('--alert', () => {
    const ALERT_ID = 'al_ec2e8c92-1653-4910-ac6c-4a431f08db4d';
    const ALERT_START = Date.parse('2026-08-18T02:45:00.000Z');
    const ALERT_END = Date.parse('2026-08-18T03:00:00.000Z');

    function mockAlertLookup() {
      client.scenario.get('/alerts/v3/groups', (_req: any, res: any) => {
        res.json([
          {
            id: 'group_1',
            alerts: [
              {
                id: ALERT_ID,
                title: 'DDoS Mitigation',
                type: 'firewallCustomRule_anomaly',
                startedAt: ALERT_START,
                resolvedAt: ALERT_END,
                data: {
                  count: 45_000,
                  action: 'challenge',
                  ruleId: 'sys_dos_mitigation',
                },
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
    }

    it('ANDs the alert filter with the entity', async () => {
      mockAlertLookup();
      client.setArgv(
        'firewall',
        'traffic',
        'inspect',
        'ip',
        '104.30.175.37',
        '--alert',
        ALERT_ID
      );
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(0);

      expect(capturedBodies.length).toBeGreaterThan(0);
      for (const body of capturedBodies) {
        expect(body.filter).toContain("client_ip eq '104.30.175.37'");
        expect(body.filter).toContain(
          "waf_action in ('challenge', 'challenge-failed', 'challenge-solved')"
        );
        expect(body.filter).toContain("waf_rule_id eq 'sys_dos_mitigation'");
        expect(body.startTime).toEqual(new Date(ALERT_START).toISOString());
        expect(body.endTime).toEqual(new Date(ALERT_END).toISOString());
      }
    });

    it('errors when the alert id is unknown', async () => {
      mockAlertLookup();
      client.setArgv(
        'firewall',
        'traffic',
        'inspect',
        'ip',
        '104.30.175.37',
        '--alert',
        'nope'
      );
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'No firewall alert found with id "nope"'
      );
    });

    it('includes alertId and window in JSON', async () => {
      mockAlertLookup();
      client.setArgv(
        'firewall',
        'traffic',
        'inspect',
        'ip',
        '104.30.175.37',
        '--alert',
        ALERT_ID,
        '--json'
      );
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(0);
      const payload = JSON.parse((client.stdout as any).getFullOutput());
      expect(payload.alertId).toEqual(ALERT_ID);
      expect(payload.window.start).toEqual(new Date(ALERT_START).toISOString());
      expect(payload.filter).toContain("client_ip eq '104.30.175.37'");
    });
  });
});
