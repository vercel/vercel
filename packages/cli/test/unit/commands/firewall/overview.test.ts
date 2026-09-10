import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useListFirewallConfigs,
  useGetBypass,
  useGetBypassError,
  useFirewallActivity,
  firewallActivity,
  createConfig,
  createRule,
  createIpRule,
  createBypassRule,
  createChange,
  createAttackAnomaly,
  FIREWALL_ROLLUP_COLUMN,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import {
  setupTmpDir,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';

describe('firewall overview', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'firewall-test-project',
      name: 'firewall-test',
    });
    const cwd = setupUnitFixture('commands/firewall');
    client.cwd = cwd;
    useFirewallActivity();
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

  it('should show firewall overview when enabled with rules', async () => {
    const active = createConfig({
      firewallEnabled: true,
      rules: [createRule(1), createRule(2), createRule(3)],
      ips: [createIpRule(1), createIpRule(2)],
    });
    useListFirewallConfigs(active, null);
    useGetBypass([createBypassRule(1)]);

    client.setArgv('firewall', 'overview');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('2 active, 1 inactive (3 total)');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('Enabled');
    expect(fullOutput).toContain('2 active, 1 inactive (3 total)');
    expect(fullOutput).toContain('IP Blocks');
    expect(fullOutput).toContain('Bypass');
    // Managed rulesets now render here too, from the shared status block.
    expect(fullOutput).toContain('Bot Protection');
    expect(fullOutput).toContain('AI Bots');
    expect(fullOutput).toContain('OWASP');
    // Old hand-padded labels are gone; aligned rows carry no colon.
    expect(fullOutput).not.toContain('System Bypass:');
    expect(fullOutput).not.toContain('Custom Rules:');
    expect(fullOutput).not.toContain('System Mitigations:');
  });

  it('shows the overview for the project selected by --project', async () => {
    client.cwd = setupTmpDir();
    client.config.currentTeam = 'team_dummy';
    useProject({
      ...defaultProject,
      id: 'explicit-firewall',
      name: 'explicit-firewall',
      accountId: 'team_dummy',
    });
    useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
    useGetBypass([]);
    client.setArgv('firewall', 'overview', '--project', 'explicit-firewall');

    await expect(firewall(client)).resolves.toEqual(0);
    await expect(client.stderr).toOutput('Enabled');
  });

  it('should show firewall overview when disabled', async () => {
    const active = createConfig({
      firewallEnabled: false,
      rules: [],
      ips: [],
    });
    useListFirewallConfigs(active, null);
    useGetBypass([]);

    client.setArgv('firewall', 'overview');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Disabled');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('Disabled');
    expect(fullOutput).toContain('0 active, 0 inactive (0 total)');
  });

  it('should show pending draft changes with content details', async () => {
    const active = createConfig({ firewallEnabled: true });
    const draft = createConfig({
      id: 'config_draft',
      changes: [
        createChange('rules.insert', {
          value: { name: 'New Rule' },
        }),
        createChange('ip.insert', {
          value: { ip: '1.2.3.4' },
        }),
      ],
    });
    useListFirewallConfigs(active, draft);
    useGetBypass([]);

    client.setArgv('firewall', 'overview');
    const exitCodePromise = firewall(client);
    // Wait for the last line of output — guarantees all previous lines were also printed
    await expect(client.stderr).toOutput('Added IP block 1.2.3.4');
    expect(await exitCodePromise).toEqual(0);

    // Verify the full output contains all expected draft details
    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('2 unpublished changes');
    expect(fullOutput).toContain('Added rule "New Rule"');
    expect(fullOutput).toContain('Added IP block 1.2.3.4');
  });

  it('should show not configured when no active config', async () => {
    useListFirewallConfigs(null, null);
    useGetBypass([]);

    client.setArgv('firewall', 'overview');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Not configured');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('Not configured');
  });

  it('should output JSON with --json flag', async () => {
    const active = createConfig({ firewallEnabled: true });
    useListFirewallConfigs(active, null);
    useGetBypass([]);

    client.setArgv('firewall', 'overview', '--json');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);

    const json = JSON.parse(client.stdout.getFullOutput());
    // Omitted entirely when the bypass list was readable, so its presence is
    // itself the signal that the value is missing for a reason.
    expect(json).not.toHaveProperty('bypassUnavailable');
  });

  it('leaves the request flow to firewall status', async () => {
    useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
    useGetBypass([]);

    client.setArgv('firewall', 'overview', '--json');
    expect(await firewall(client)).toEqual(0);

    const json = JSON.parse(client.stdout.getFullOutput());

    // Overview reports configuration and activity; the pipeline as data is
    // `firewall status --json`, so one command owns that shape.
    expect(json).not.toHaveProperty('requestFlow');
    expect(json).not.toHaveProperty('bypasses');
  });

  it('does not repeat each series total that stats already carries', async () => {
    useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
    useGetBypass([]);
    useFirewallActivity({
      series: [
        { timestamp: '2026-09-03T10:00:00.000Z', waf_action: 'deny', value: 4 },
        { timestamp: '2026-09-03T11:00:00.000Z', waf_action: 'deny', value: 6 },
        {
          timestamp: '2026-09-03T10:00:00.000Z',
          waf_action: 'allow',
          value: 1,
        },
      ],
    });

    client.setArgv('firewall', 'overview', '--json');
    expect(await firewall(client)).toEqual(0);

    const json = JSON.parse(client.stdout.getFullOutput());

    // The per-action totals live in `stats`, keyed by action...
    expect(json.stats.deny).toEqual(10);
    expect(json.stats.allow).toEqual(1);

    // ...so the series carry shape only, not the same numbers again.
    const deny = json.series.find(
      (s: { action: string }) => s.action === 'deny'
    );
    expect(deny).not.toHaveProperty('total');
    expect(deny.timeseries).toEqual([
      { timestamp: '2026-09-03T10:00:00.000Z', value: 4 },
      { timestamp: '2026-09-03T11:00:00.000Z', value: 6 },
    ]);
    for (const entry of json.series) {
      expect(Object.keys(entry).sort()).toEqual(['action', 'timeseries']);
    }
  });

  it('queries traffic and rules over one window', async () => {
    useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
    useGetBypass([]);
    useFirewallActivity();

    client.setArgv('firewall', 'overview');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Requests by Action');
    expect(await exitCodePromise).toEqual(0);

    // The two panels of the activity block: traffic by action, and by rule.
    const [byAction, byRule] = firewallActivity.queries;
    expect(byAction.groupBy).toEqual(['waf_action']);
    expect(byRule.groupBy).toEqual(['waf_rule_id']);

    // Both panels cover the same period, so a reader can compare them. The
    // window is now the caller's: `getFirewallMetrics` takes it rather than
    // deriving one, which is what lets all three queries go out together.
    expect(byRule.startTime).toEqual(byAction.startTime);
    expect(byRule.endTime).toEqual(byAction.endTime);
    expect(new Date(byAction.endTime!).getTime()).toBeGreaterThan(
      new Date(byAction.startTime!).getTime()
    );
  });

  describe('attacks mitigated', () => {
    // The metrics window is the past 24 hours, so these sit inside it.
    const hourAgo = () => Date.now() - 3_600_000;
    const twoHoursAgo = () => Date.now() - 2 * 3_600_000;

    it('counts an attack that started and ended inside the window', async () => {
      useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
      useGetBypass([]);
      useFirewallActivity({
        anomalies: [
          createAttackAnomaly({
            startTime: twoHoursAgo(),
            endTime: hourAgo(),
            denied: 5_000,
          }),
        ],
      });

      client.setArgv('firewall', 'overview', '--json');
      expect(await firewall(client)).toEqual(0);

      const json = JSON.parse(client.stdout.getFullOutput());
      // An attack the firewall saw off is still an attack it mitigated during
      // the window; counting only what is active right now would report 0.
      expect(json.stats.attacksMitigated).toEqual(1);
    });

    it('counts an attack still running', async () => {
      useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
      useGetBypass([]);
      useFirewallActivity({
        anomalies: [
          createAttackAnomaly({ startTime: hourAgo(), challenged: 900 }),
        ],
      });

      client.setArgv('firewall', 'overview', '--json');
      expect(await firewall(client)).toEqual(0);

      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.stats.attacksMitigated).toEqual(1);
    });

    it('leaves out an attack that ended before the window opened', async () => {
      useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
      useGetBypass([]);
      const threeDaysAgo = Date.now() - 3 * 86_400_000;
      useFirewallActivity({
        anomalies: [
          createAttackAnomaly({
            startTime: threeDaysAgo,
            endTime: threeDaysAgo + 3_600_000,
            denied: 10,
          }),
        ],
      });

      client.setArgv('firewall', 'overview', '--json');
      expect(await firewall(client)).toEqual(0);

      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.stats.attacksMitigated).toEqual(0);
    });
  });

  describe('when an alert source cannot be read', () => {
    beforeEach(() => {
      useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
      useGetBypass([]);
    });

    it('marks the attack count instead of reporting a confident zero', async () => {
      firewallActivity.alertsStatus = 500;

      client.setArgv('firewall', 'overview');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Attacks mitigated');
      expect(await exitCodePromise).toEqual(0);

      const out = client.stderr.getFullOutput();
      expect(out).toContain('at least, some alerts unread');
      expect(out).toContain('alerts HTTP 500');
      // The other source answered, so the rest of the block still stands.
      expect(out).toContain('Requests by Action');
    });

    it('reports the gap in --json', async () => {
      firewallActivity.attackStatusStatus = 503;

      client.setArgv('firewall', 'overview', '--json');
      expect(await firewall(client)).toEqual(0);

      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.alertsUnavailable.sources).toEqual(['attackStatus']);
      expect(json.alertsUnavailable.message).toContain('attack history');
      // Traffic answered, so this is not the plan gate `activityUnavailable`
      // covers; an agent has to be able to tell the two gaps apart.
      expect(json.activityUnavailable).toBeUndefined();
    });

    it('names both sources when neither answers', async () => {
      firewallActivity.alertsStatus = 500;
      firewallActivity.attackStatusStatus = 500;

      client.setArgv('firewall', 'overview', '--json');
      expect(await firewall(client)).toEqual(0);

      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.alertsUnavailable.sources.sort()).toEqual([
        'alerts',
        'attackStatus',
      ]);
      expect(json.stats.attacksMitigated).toEqual(0);
    });

    it('leaves the key out when both sources answer', async () => {
      client.setArgv('firewall', 'overview', '--json');
      expect(await firewall(client)).toEqual(0);

      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.alertsUnavailable).toBeUndefined();
      expect(json.stats.attacksMitigated).toEqual(0);
    });
  });

  describe('the rendered activity block', () => {
    // Two hourly buckets inside the window, so the axis and the sparkline
    // have something to align.
    const hour = 3_600_000;
    const bucket = (offsetHours: number) =>
      new Date(
        Math.floor((Date.now() - offsetHours * hour) / hour) * hour
      ).toISOString();

    function useActivityWithTraffic() {
      useFirewallActivity({
        series: [
          { timestamp: bucket(2), waf_action: 'deny', value: 400 },
          { timestamp: bucket(1), waf_action: 'deny', value: 1_100 },
          { timestamp: bucket(2), waf_action: 'allow', value: 90_000 },
          { timestamp: bucket(1), waf_action: 'allow', value: 120_000 },
        ],
        topRules: [
          {
            waf_rule_id: 'sys_dos_mitigation',
            [FIREWALL_ROLLUP_COLUMN]: 1_500_000,
          },
          { waf_rule_id: 'rule_001', [FIREWALL_ROLLUP_COLUMN]: 2_400 },
        ],
        anomalies: [
          createAttackAnomaly({
            startTime: Date.now() - 2 * hour,
            endTime: Date.now() - hour,
            denied: 1_500,
          }),
        ],
      });
    }

    it('renders traffic by action, the busiest rules, and alerts', async () => {
      useListFirewallConfigs(
        createConfig({ firewallEnabled: true, rules: [createRule(1)] }),
        null
      );
      useGetBypass([]);
      useActivityWithTraffic();

      client.setArgv('firewall', 'overview');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Requests by Action');
      expect(await exitCodePromise).toEqual(0);

      const out = client.stderr.getFullOutput();

      // The attack ran inside the window and has since resolved, so it counts.
      expect(out).toMatch(/Attacks mitigated.*1/);

      // Action rows carry a label, a total and a peak. Totals are summed from
      // the buckets, and the peak is the largest single bucket — 1.1k, not the
      // 1.5k total.
      expect(out).toMatch(/Deny\s+\S*\s*1\.5k\s+1\.1k/);
      expect(out).toMatch(/Allow\s+\S*\s*210\.0k\s+120\.0k/);
      expect(out).toContain('2 points (1h each)');

      // Rule ids resolve to the dashboard's display names.
      expect(out).toContain('DDoS Mitigation');
      expect(out).toMatch(/Test Rule 1\s+2\.4k\s+rule_001/);

      // Alerts raised in the window, with the DDoS row from the anomaly.
      expect(out).toContain('Alerts in this window');
    });

    it('says so when the window has no traffic', async () => {
      useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
      useGetBypass([]);
      useFirewallActivity();

      client.setArgv('firewall', 'overview');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Requests by Action');
      expect(await exitCodePromise).toEqual(0);

      const out = client.stderr.getFullOutput();
      expect(out).toContain('No request data for this period.');
      expect(out).toContain('No rule traffic for this period.');
      // An empty window is not an error, and the configuration block stands.
      expect(out).toContain('Enabled');
    });

    it('takes action totals from the summary when the API sends one', async () => {
      useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
      useGetBypass([]);
      useFirewallActivity({
        series: [{ timestamp: bucket(1), waf_action: 'deny', value: 7 }],
        // The API's own total, which must win over summing the buckets.
        actionSummary: [
          { waf_action: 'deny', [FIREWALL_ROLLUP_COLUMN]: 9_000 },
        ],
      });

      client.setArgv('firewall', 'overview', '--json');
      expect(await firewall(client)).toEqual(0);

      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.stats.deny).toEqual(9_000);
    });

    it('sums the buckets for an action the summary leaves out', async () => {
      useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
      useGetBypass([]);
      useFirewallActivity({
        series: [
          { timestamp: bucket(2), waf_action: 'deny', value: 7 },
          { timestamp: bucket(2), waf_action: 'challenge', value: 6 },
          { timestamp: bucket(1), waf_action: 'challenge', value: 4 },
        ],
        // Only `deny` has an API total. `challenge` is in the buckets alone,
        // so its total has to come from summing them — deciding that once for
        // the whole response reports 0 next to a non-empty timeseries.
        actionSummary: [
          { waf_action: 'deny', [FIREWALL_ROLLUP_COLUMN]: 9_000 },
        ],
      });

      client.setArgv('firewall', 'overview', '--json');
      expect(await firewall(client)).toEqual(0);

      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.stats.deny).toEqual(9_000);
      expect(json.stats.challenge).toEqual(10);
    });
  });

  it('scopes the alerts request instead of taking the newest 100', async () => {
    useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
    useGetBypass([]);
    useFirewallActivity();

    client.setArgv('firewall', 'overview', '--json');
    expect(await firewall(client)).toEqual(0);

    // The endpoint pages at 100 groups and has no cursor, so an unscoped
    // request would hand back the newest 100 with no way to tell that was not
    // all of them — on a noisy project that can be a few hours of bot alerts,
    // pushing the attacks out of the window entirely.
    const query = firewallActivity.alertsQuery ?? {};
    expect(query.limit).toEqual('200');
    expect(typeof query.from).toBe('string');
    expect(typeof query.to).toBe('string');
    // ISO strings: the API rejects epoch milliseconds outright.
    const from = new Date(query.from as string).getTime();
    const to = new Date(query.to as string).getTime();
    expect(Number.isNaN(from)).toBe(false);
    expect(to - from).toEqual(86_400_000);
  });

  it('lists an attack that began before the window and is still open', async () => {
    useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
    useGetBypass([]);
    useFirewallActivity({
      anomalies: [
        // Started 30 hours ago, never resolved, so it was still mitigating
        // through the whole of the reported day.
        createAttackAnomaly({
          startTime: Date.now() - 30 * 3_600_000,
          endTime: null,
          challenged: 5_000,
        }),
      ],
    });

    client.setArgv('firewall', 'overview', '--json');
    expect(await firewall(client)).toEqual(0);

    const json = JSON.parse(client.stdout.getFullOutput());
    // Counted, and listed. Scoping the list to alerts raised inside the window
    // would have counted this one while showing nothing to explain it.
    expect(json.stats.attacksMitigated).toEqual(1);
    expect(
      json.annotations.filter(
        (a: { title: string }) => a.title === 'DDoS Mitigation'
      )
    ).toHaveLength(1);
  });

  describe('DDoS reported by the alerts API', () => {
    it('counts a DDoS system-rule alert as an attack', async () => {
      useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
      useGetBypass([]);
      useFirewallActivity({
        alerts: [
          {
            id: 'group_1',
            alerts: [
              {
                id: 'alert_1',
                title: 'DDoS Mitigation',
                type: 'firewallSystemRule_anomaly',
                startedAt: Date.now() - 3_600_000,
                data: {
                  ruleId: 'sys_dos_mitigation',
                  action: 'challenge',
                  count: 4_200,
                },
              },
            ],
          },
        ],
      });

      client.setArgv('firewall', 'overview', '--json');
      expect(await firewall(client)).toEqual(0);

      // Security+ accounts get their DDoS episodes from the alerts API, so an
      // attack reported only there still has to count.
      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.stats.attacksMitigated).toEqual(1);
    });

    it('ignores a system-rule alert for a rule that is not DDoS', async () => {
      useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
      useGetBypass([]);
      useFirewallActivity({
        alerts: [
          {
            id: 'group_1',
            alerts: [
              {
                id: 'alert_1',
                title: 'IP Blocking',
                type: 'firewallSystemRule_anomaly',
                startedAt: Date.now() - 3_600_000,
                data: { ruleId: 'ip_blocking', action: 'deny', count: 10 },
              },
            ],
          },
        ],
      });

      client.setArgv('firewall', 'overview', '--json');
      expect(await firewall(client)).toEqual(0);

      // System-rule anomalies also cover IP blocking and attack mode, so the
      // rule id decides — a blocked-IP spike is not an attack mitigated.
      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.stats.attacksMitigated).toEqual(0);
    });
  });

  it('names traffic rows topRules, not rules', async () => {
    useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
    useGetBypass([]);

    client.setArgv('firewall', 'overview', '--json');
    expect(await firewall(client)).toEqual(0);

    const json = JSON.parse(client.stdout.getFullOutput());
    // `rules` is a count summary in `firewall status --json`. One key cannot
    // mean two shapes across the family, so the traffic rows are `topRules`.
    expect(json).toHaveProperty('topRules');
    expect(json).not.toHaveProperty('rules');
  });

  it('keeps the configuration block when the traffic query times out', async () => {
    useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
    useGetBypass([]);
    // The activity queries scan the whole window, so a busy enough project
    // exceeds what the warehouse will spend on a day of it. Losing the
    // configuration block as well would be the worst possible moment for it.
    firewallActivity.queryStatus = 408;

    client.setArgv('firewall', 'overview');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('timed out');
    expect(await exitCodePromise).toEqual(0);

    const out = client.stderr.getFullOutput();
    expect(out).toContain('Enabled');
    expect(out).not.toContain('Requests by Action');
    // A timeout is not a plan limit, and must not be reported as an upsell.
    expect(out).not.toContain('Observability Plus');
  });

  it('names a timeout as the reason in JSON, not a plan gate', async () => {
    useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
    useGetBypass([]);
    firewallActivity.queryStatus = 408;

    client.setArgv('firewall', 'overview', '--json');
    expect(await firewall(client)).toEqual(0);

    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json.activityUnavailable.reason).toEqual('timeout');
    expect(json.stats).toBeNull();
  });

  it('reports configuration when traffic data is unavailable', async () => {
    // Observability answers 402 without Observability Plus; the configuration
    // block is still worth printing.
    useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
    useGetBypass([]);
    firewallActivity.queryStatus = 402;

    client.setArgv('firewall', 'overview');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Observability Plus');
    expect(await exitCodePromise).toEqual(0);

    const output = client.stderr.getFullOutput();
    expect(output).toContain('Enabled');
    expect(output).not.toContain('Requests by Action');
  });

  it('says why the activity window is missing in JSON', async () => {
    useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
    useGetBypass([]);
    firewallActivity.queryStatus = 402;

    client.setArgv('firewall', 'overview', '--json');
    expect(await firewall(client)).toEqual(0);

    const json = JSON.parse(client.stdout.getFullOutput());

    // Null activity alone cannot distinguish "plan does not include it" from
    // a personal account or a genuinely quiet window, so it is named.
    expect(json.period).toBeNull();
    expect(json.stats).toBeNull();
    expect(json.activityUnavailable).toEqual({
      reason: 'plan',
      message: 'Traffic and alerts need Observability Plus.',
    });
  });

  describe('when IP Bypass is unavailable on the plan', () => {
    it('still renders the overview instead of failing', async () => {
      useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
      useGetBypassError();

      client.setArgv('firewall', 'overview');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Requires Pro or Enterprise');
      expect(await exitCodePromise).toEqual(0);

      const fullOutput = client.stderr.getFullOutput();
      // The rest of the overview is still reported.
      expect(fullOutput).toContain('Enabled');
      expect(fullOutput).toContain('IP Blocks');
      expect(fullOutput).not.toContain('IP Bypass is unavailable');
      // Bypass is gated; mitigations are not, so they must not be conflated.
      expect(fullOutput).not.toContain('System Mitigations:   Not available');
    });

    it('reports mitigation status from the project', async () => {
      // Mitigations are read from the project, which is not plan-gated, so the
      // status is still accurate when the bypass endpoint is unavailable.
      // Uses its own project so the mock gets a distinct route; re-registering
      // the one from `beforeEach` would not override it.
      client.cwd = setupTmpDir();
      client.config.currentTeam = 'team_dummy';
      const resumesAt = Math.floor(Date.now() / 1000) + 2 * 60 * 60;
      useProject({
        ...defaultProject,
        id: 'paused-mitigations',
        name: 'paused-mitigations',
        accountId: 'team_dummy',
        // The API returns `security`, but it is not modelled on `Project` —
        // which is why the command fetches it as `ProjectSecurityResponse`.
        security: { firewallBypassIps: [`0.0.0.0/0#${resumesAt}`] },
      } as Parameters<typeof useProject>[0]);
      useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
      useGetBypassError();

      client.setArgv('firewall', 'overview', '--project', 'paused-mitigations');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Paused');
      expect(await exitCodePromise).toEqual(0);

      expect(client.stderr.getFullOutput()).toContain('auto-resumes in');
    });

    it('reports bypass as null in JSON output, and why', async () => {
      useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
      useGetBypassError();

      client.setArgv('firewall', 'overview', '--json');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(0);

      const json = JSON.parse(client.stdout.getFullOutput());
      // `null` distinguishes "unreadable" from `[]`, meaning "none configured".
      expect(json.bypass).toBeNull();
      // Which alone does not say why, so the reason is reported alongside it.
      // JSON has no column alignment to break, so unlike the table this passes
      // the API's own message through rather than restating it.
      expect(json.bypassUnavailable).toEqual({
        reason: 'plan',
        message:
          'IP Bypass is unavailable for team acme. Pro and Enterprise plans include it.',
      });
    });

    it('falls back to its own wording when the API sends no message', async () => {
      useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
      useGetBypassError(402, '');

      client.setArgv('firewall', 'overview', '--json');
      expect(await firewall(client)).toEqual(0);

      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.bypassUnavailable.reason).toEqual('plan');
      expect(json.bypassUnavailable.message).toEqual(
        'IP Bypass requires a Pro or Enterprise plan.'
      );
    });
  });

  it('still fails on a 404, which no longer means plan gating', async () => {
    useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
    useGetBypassError(404, 'Project not found');

    client.setArgv('firewall', 'overview');
    expect(await firewall(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).not.toContain(
      'Requires Pro or Enterprise'
    );
  });

  it('still fails when the bypass request is denied by permissions', async () => {
    // The API checks permissions after the plan gate, so a 403 means the user
    // lacks access and must not be reported as a plan limitation.
    useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
    useGetBypassError(403, 'You do not have permission to read IP blocking.');

    client.setArgv('firewall', 'overview');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(1);

    expect(client.stderr.getFullOutput()).not.toContain(
      'Requires Pro or Enterprise'
    );
  });
});
