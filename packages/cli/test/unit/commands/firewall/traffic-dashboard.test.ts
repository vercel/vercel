import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

const FIREWALL_ROLLUP = 'vercel_firewall_action_count_sum';
const REQUEST_ROLLUP = 'vercel_request_count_sum';

function mockTrafficApis(capturedBodies: any[]) {
  const now = Date.now();
  client.scenario.post('/v2/observability/query', (req: any, res: any) => {
    const body = req.body ?? {};
    capturedBodies.push(body);
    const groupBy: string[] = body.groupBy ?? [];
    const rollup =
      body.metric === 'vercel.request.count' ? REQUEST_ROLLUP : FIREWALL_ROLLUP;

    if (groupBy[0] === 'waf_action') {
      res.json({
        summary: [
          { waf_action: 'allow', [rollup]: 8_200_000 },
          { waf_action: 'deny', [rollup]: 34_500 },
        ],
        data: [
          {
            timestamp: new Date(now - 2 * 3600_000).toISOString(),
            waf_action: 'allow',
            [rollup]: 100,
          },
          {
            timestamp: new Date(now - 1 * 3600_000).toISOString(),
            waf_action: 'deny',
            [rollup]: 50,
          },
        ],
        statistics: {},
      });
      return;
    }

    // Top-list widget query: echo synthetic rows for whatever field.
    const field = groupBy[0] ?? 'unknown';
    res.json({
      summary: [
        { [field]: `${field}-top`, [rollup]: 500_000 },
        { [field]: `${field}-second`, [rollup]: 100 },
      ],
      data: [],
      statistics: {},
    });
  });
}

describe('firewall traffic-dashboard', () => {
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
    mockTrafficApis(capturedBodies);
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('firewall', 'traffic-dashboard', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'firewall:traffic-dashboard',
        },
      ]);
    });
  });

  it('prints the actions timeseries and all widgets', async () => {
    client.setArgv('firewall', 'traffic-dashboard');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Requests by Action');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('Firewall Traffic');
    expect(fullOutput).toMatch(/Action\s+Trend\s+Total\s+Peak\s+Peak at/);
    expect(fullOutput).toMatch(/Allow\s+\S+\s+8\.2M/);
    for (const title of [
      'Top IPs',
      'Top JA4 Digests',
      'Top AS Names',
      'Top User Agents',
      'Top Request Paths',
      'Rules',
      'Top Hosts',
      'Verified Bots',
    ]) {
      expect(fullOutput).toContain(title);
    }
    expect(fullOutput).toContain('client_ip-top');
    expect(fullOutput).toContain('traffic inspect');
  });

  it('routes the `traffic` alias', async () => {
    client.setArgv('firewall', 'traffic');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Requests by Action');
    expect(await exitCodePromise).toEqual(0);
  });

  it('applies dimension filter flags to every query', async () => {
    client.setArgv(
      'firewall',
      'traffic-dashboard',
      '--ip',
      '1.2.3.4',
      '--action',
      'deny'
    );
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);

    expect(capturedBodies.length).toBeGreaterThan(1);
    for (const body of capturedBodies) {
      expect(body.filter).toContain("client_ip eq '1.2.3.4'");
      expect(body.filter).toContain("waf_action eq 'deny'");
    }
  });

  it('scopes Verified Bots to the request metric', async () => {
    client.setArgv('firewall', 'traffic-dashboard');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);

    const botQuery = capturedBodies.find(
      b => (b.groupBy ?? [])[0] === 'bot_name'
    );
    expect(botQuery).toBeDefined();
    expect(botQuery.metric).toEqual('vercel.request.count');
    expect(botQuery.filter).toContain("bot_verified eq 'pass'");
  });

  it('outputs JSON with --json', async () => {
    client.setArgv('firewall', 'traffic-dashboard', '--json');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    const payload = JSON.parse((client.stdout as any).getFullOutput());
    expect(payload.actions.groups.length).toEqual(2);
    expect(payload.actions.groups[0].action).toEqual('allow');
    expect(payload.widgets.length).toEqual(8);
    expect(payload.widgets[0].rows[0].total).toEqual(500_000);
  });

  describe('--alert', () => {
    const ALERT_ID = 'al_ec2e8c92-1653-4910-ac6c-4a431f08db4d';
    const ALERT_START = Date.parse('2026-08-18T02:45:00.000Z');
    const ALERT_END = Date.parse('2026-08-18T03:00:00.000Z');
    const DDOS_START = ALERT_START;
    const DDOS_ID = `team_dummy-firewall-test-project-${DDOS_START}`;

    function mockAlertLookup() {
      client.scenario.get('/alerts/v3/groups', (_req: any, res: any) => {
        res.json([
          {
            id: 'group_1',
            alerts: [
              {
                id: ALERT_ID,
                title: 'Firewall Custom Rule Anomaly',
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
          res.json({
            anomalies: [
              {
                ownerId: 'team_dummy',
                projectId: 'firewall-test-project',
                startTime: DDOS_START,
                endTime: ALERT_END,
                atMinute: Math.floor(DDOS_START / 60_000),
                state: 'resolved',
                affectedHostMap: {
                  'vercel.com': {
                    ddosAlerts: {
                      'sys_dos_mitigation:deny': {
                        atMinute: String(Math.floor(DDOS_START / 60_000)),
                        totalReqs: 1_900_000,
                      },
                    },
                  },
                },
              },
            ],
          });
        }
      );
    }

    it('scopes the window and filter to a DDoS alert', async () => {
      mockAlertLookup();
      client.setArgv('firewall', 'traffic-dashboard', '--alert', DDOS_ID);
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(0);

      expect(capturedBodies.length).toBeGreaterThan(0);
      for (const body of capturedBodies) {
        expect(body.startTime).toEqual(new Date(DDOS_START).toISOString());
        expect(body.endTime).toEqual(new Date(ALERT_END).toISOString());
        expect(body.filter).toContain("waf_action eq 'deny'");
        expect(body.filter).toContain("waf_rule_id eq 'sys_dos_mitigation'");
      }
    });

    it('resolves an unambiguous alert id prefix', async () => {
      mockAlertLookup();
      client.setArgv('firewall', 'traffic-dashboard', '--alert', 'al_ec2e8c92');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(0);
      expect(capturedBodies[0].filter).toContain(
        "waf_action in ('challenge', 'challenge-failed', 'challenge-solved')"
      );
      expect(capturedBodies[0].startTime).toEqual(
        new Date(ALERT_START).toISOString()
      );
    });

    it('errors when the alert id is unknown', async () => {
      mockAlertLookup();
      client.setArgv('firewall', 'traffic-dashboard', '--alert', 'nope');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'No firewall alert found with id "nope"'
      );
    });

    it('ANDs --alert with dimension flags', async () => {
      mockAlertLookup();
      client.setArgv(
        'firewall',
        'traffic-dashboard',
        '--alert',
        ALERT_ID,
        '--ip',
        '104.30.175.37'
      );
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(0);
      for (const body of capturedBodies) {
        expect(body.filter).toContain("client_ip eq '104.30.175.37'");
        expect(body.filter).toContain("waf_rule_id eq 'sys_dos_mitigation'");
      }
    });

    it('lets --since override the anomaly window', async () => {
      mockAlertLookup();
      client.setArgv(
        'firewall',
        'traffic-dashboard',
        '--alert',
        ALERT_ID,
        '--since',
        '1h'
      );
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(0);
      const startMs = Date.parse(capturedBodies[0].startTime);
      expect(startMs).toBeGreaterThan(ALERT_START);
    });

    it('includes alertId and window in JSON', async () => {
      mockAlertLookup();
      client.setArgv(
        'firewall',
        'traffic-dashboard',
        '--alert',
        ALERT_ID,
        '--json'
      );
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(0);
      const payload = JSON.parse((client.stdout as any).getFullOutput());
      expect(payload.alertId).toEqual(ALERT_ID);
      expect(payload.window).toEqual({
        start: new Date(ALERT_START).toISOString(),
        end: new Date(ALERT_END).toISOString(),
      });
    });
  });
});
