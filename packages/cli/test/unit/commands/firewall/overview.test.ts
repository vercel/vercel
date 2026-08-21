import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import {
  useListFirewallConfigs,
  createConfig,
  createRule,
  useGetBypass,
} from '../../../mocks/firewall';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

const FIREWALL_ROLLUP = 'vercel_firewall_action_count_sum';
const DEFAULT_RULE_ROWS = [
  { id: 'managed_bot_protection', total: 4_800_000 },
  { id: 'rule_001', total: 437_600 },
  { id: 'sys_dos_mitigation', total: 155_900 },
];

let ruleRows = DEFAULT_RULE_ROWS;

function mockOverviewApis() {
  const now = Date.now();

  client.scenario.post('/v2/observability/query', (req: any, res: any) => {
    const groupBy: string[] = req.body?.groupBy ?? [];

    if (groupBy[0] === 'waf_rule_id') {
      res.json({
        summary: ruleRows.map(r => ({
          waf_rule_id: r.id,
          [FIREWALL_ROLLUP]: r.total,
        })),
        data: [],
        statistics: {},
      });
      return;
    }

    res.json({
      summary: [
        { waf_action: 'allow', [FIREWALL_ROLLUP]: 8_200_000 },
        { waf_action: 'deny', [FIREWALL_ROLLUP]: 34_500 },
        { waf_action: 'challenge', [FIREWALL_ROLLUP]: 34_500 },
        { waf_action: 'log', [FIREWALL_ROLLUP]: 1_000_000 },
      ],
      data: [
        {
          timestamp: new Date(now - 3 * 3600_000).toISOString(),
          waf_action: 'allow',
          [FIREWALL_ROLLUP]: 100,
        },
        {
          timestamp: new Date(now - 2 * 3600_000).toISOString(),
          waf_action: 'deny',
          [FIREWALL_ROLLUP]: 50,
        },
        {
          timestamp: new Date(now - 1 * 3600_000).toISOString(),
          waf_action: 'challenge',
          [FIREWALL_ROLLUP]: 75,
        },
      ],
      statistics: {},
    });
  });

  client.scenario.get('/alerts/v3/groups', (_req: any, res: any) => {
    res.json([
      {
        id: 'group_1',
        alerts: [
          {
            id: 'alert_1',
            title: 'Firewall Custom Rule Anomaly',
            type: 'firewallCustomRule_anomaly',
            startedAt: now - 30 * 60_000,
            data: { count: 1200, action: 'deny', ruleId: 'rule_1' },
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
            startTime: now - 5 * 60_000,
            endTime: null,
            atMinute: Math.floor((now - 5 * 60_000) / 60_000),
            state: 'active',
            affectedHostMap: {
              'example.com': {
                ddosAlerts: {
                  'sys_dos_mitigation:deny': {
                    atMinute: String(Math.floor((now - 5 * 60_000) / 60_000)),
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

describe('firewall overview', () => {
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
    useListFirewallConfigs(
      createConfig({
        firewallEnabled: true,
        rules: [createRule(1)],
        managedRules: {
          bot_filter: { active: true, action: 'challenge' },
        },
      }),
      null
    );
    useGetBypass([]);
    ruleRows = [...DEFAULT_RULE_ROWS];
    mockOverviewApis();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('firewall', 'overview', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'firewall:overview',
        },
      ]);
    });
  });

  it('prints stats, timeseries, traffic by rule, and alert annotations', async () => {
    client.setArgv('firewall', 'overview');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Requests by Action');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('Attacks mitigated');
    // Chart table: header columns and per-action rows with totals.
    expect(fullOutput).toContain('Requests by Action');
    expect(fullOutput).toMatch(/points \(1h each\)/);
    expect(fullOutput).toMatch(/Action\s+Trend\s+Total\s+Peak\s+Peak at/);
    expect(fullOutput).toMatch(/Allow\s+\S+\s+8\.2M/);
    expect(fullOutput).toMatch(/Deny\s+\S+\s+34\.5k/);
    // Rules: resolved names, counts, and ids for inspect.
    expect(fullOutput).toContain('(top 8)');
    expect(fullOutput).toMatch(/Rule\s+Requests\s+Id/);
    expect(fullOutput).toMatch(
      /Bot Protection\s+4\.8M\s+managed_bot_protection/
    );
    expect(fullOutput).toMatch(/Test Rule 1\s+437\.6k\s+rule_001/);
    expect(fullOutput).toMatch(
      /DDoS Mitigation\s+155\.9k\s+sys_dos_mitigation/
    );
    expect(fullOutput).not.toContain('Drill into a rule with');
    expect(fullOutput).toContain('Enabled');
    expect(fullOutput).toMatch(/Bot Protection\s+Challenge/);
    // One next-command pair from the highest-signal alert in the window.
    expect(fullOutput).toMatch(
      /firewall alerts inspect team_dummy-firewall-test-project-\d+/
    );
    expect(fullOutput).toMatch(
      /firewall traffic --alert team_dummy-firewall-test-project-\d+/
    );
    expect(fullOutput).not.toContain('drill-in');
    expect(fullOutput).not.toContain('traffic-dashboard');
    expect(fullOutput).not.toContain('alert-detail');
    // Alerts carry absolute UTC timestamps so they correlate with `Peak at`.
    expect(fullOutput).toContain('Alerts in this window');
    expect(fullOutput).toMatch(/! \d{2}:\d{2} UTC/);
  });

  it('prints an empty state when there is no rule traffic', async () => {
    ruleRows = [];
    client.setArgv('firewall', 'overview');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('No rule traffic for this period.');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('No rule traffic for this period.');
    expect(fullOutput).not.toContain('traffic inspect rule');
    expect(fullOutput).toMatch(/firewall alerts inspect /);
  });

  it('outputs JSON with --json', async () => {
    client.setArgv('firewall', 'overview', '--json');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    const payload = JSON.parse((client.stdout as any).getFullOutput());
    expect(payload.status.firewallEnabled).toEqual(true);
    expect(payload.status.owasp).toEqual(
      expect.objectContaining({ enabled: false })
    );
    expect(payload.stats.deny).toEqual(34500);
    expect(payload.stats.attacksMitigated).toEqual(1);
    expect(payload.series.length).toBeGreaterThan(0);
    expect(payload.annotations.length).toBeGreaterThan(0);
    expect(payload.rules).toEqual([
      {
        id: 'managed_bot_protection',
        name: 'Bot Protection',
        total: 4_800_000,
      },
      { id: 'rule_001', name: 'Test Rule 1', total: 437_600 },
      {
        id: 'sys_dos_mitigation',
        name: 'DDoS Mitigation',
        total: 155_900,
      },
    ]);
    expect(payload.next).toEqual(
      expect.arrayContaining([
        {
          view: 'detail',
          command: expect.stringMatching(
            /^vercel firewall alerts inspect team_dummy-firewall-test-project-/
          ),
        },
        {
          view: 'traffic',
          command: expect.stringMatching(
            /^vercel firewall traffic --alert team_dummy-firewall-test-project-/
          ),
        },
      ])
    );
    expect(payload.next).toHaveLength(2);
  });
});
