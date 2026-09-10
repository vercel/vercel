import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useFirewallActivity,
  firewallActivity,
  createAttackAnomaly,
  createO11yFirewallAlert,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('firewall alerts list', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'firewall-test-project',
      name: 'firewall-test',
    });
    client.cwd = setupUnitFixture('commands/firewall');
    useFirewallActivity();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('firewall', 'alerts', 'list', '--help');
      expect(await firewall(client)).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:alerts', value: 'alerts' },
        { key: 'flag:help', value: 'firewall:alerts:list' },
      ]);
    });
  });

  it('never posts observability queries', async () => {
    client.setArgv('firewall', 'alerts', 'list');
    expect(await firewall(client)).toEqual(0);
    expect(firewallActivity.queries).toEqual([]);
  });

  it('shows empty active and resolved sections', async () => {
    client.setArgv('firewall', 'alerts', 'list');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('No alerts in this window.');
    expect(await exitCodePromise).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain('Firewall alerts');
  });

  it('splits active and resolved alerts from both sources', async () => {
    const started = Date.now() - 2 * 3_600_000;
    useFirewallActivity({
      anomalies: [
        createAttackAnomaly({
          startTime: started,
          endTime: started + 3_600_000,
          denied: 782_700,
        }),
      ],
      alerts: [
        {
          id: 'group_1',
          alerts: [
            createO11yFirewallAlert({
              id: 'al_active',
              resolvedAt: undefined,
              count: 1_200,
              action: 'challenge',
            }),
            createO11yFirewallAlert({
              id: 'al_resolved',
              startedAt: started,
              resolvedAt: started + 1_800_000,
              count: 673_200,
            }),
          ],
        },
      ],
    });

    client.setArgv('firewall', 'alerts', 'list');
    expect(await firewall(client)).toEqual(0);

    const out = client.stderr.getFullOutput();
    // Active first, so an ongoing attack is the first row read.
    expect(out).toMatch(/Active[\s\S]*al_active/);
    expect(out).toContain('al_resolved');
    expect(out).toContain('Resolved');
    expect(out).toContain(`team_dummy-firewall-test-project-${started}`);
    expect(out).toContain('782.7k');
    expect(out).not.toContain('No alerts in this window.');
  });

  it('scopes the default window to 24h and accepts --since', async () => {
    client.setArgv('firewall', 'alerts', 'list');
    expect(await firewall(client)).toEqual(0);

    const query = firewallActivity.alertsQuery ?? {};
    const from = new Date(query.from as string).getTime();
    const to = new Date(query.to as string).getTime();
    expect(to - from).toEqual(86_400_000);

    useFirewallActivity();
    client.setArgv('firewall', 'alerts', 'list', '--since', '7d');
    expect(await firewall(client)).toEqual(0);
    const sinceQuery = firewallActivity.alertsQuery ?? {};
    const sinceFrom = new Date(sinceQuery.from as string).getTime();
    const sinceTo = new Date(sinceQuery.to as string).getTime();
    expect(sinceTo - sinceFrom).toBeGreaterThanOrEqual(6 * 86_400_000);
  });

  it('asks attack-status for a lookback from now, not the window length', async () => {
    // `since` is days back from now, so deriving it from the window's own
    // length asked for the last day whenever a past day was wanted, and the
    // DDoS source came back empty for every window not ending now.
    const dayMs = 86_400_000;
    const from = new Date(Date.now() - 3 * dayMs);
    const to = new Date(from.getTime() + dayMs);
    const started = from.getTime() + 3_600_000;
    useFirewallActivity({
      anomalies: [
        createAttackAnomaly({
          startTime: started,
          endTime: started + 600_000,
          denied: 4_200,
        }),
      ],
    });

    client.setArgv(
      'firewall',
      'alerts',
      'list',
      '--since',
      from.toISOString(),
      '--until',
      to.toISOString()
    );
    expect(await firewall(client)).toEqual(0);

    const since = Number(firewallActivity.attackStatusQuery?.since);
    expect(since).toBeGreaterThanOrEqual(3);
    expect(client.stderr.getFullOutput()).toContain(
      `team_dummy-firewall-test-project-${started}`
    );
  });

  it('caps the lookback at the week attack-status will answer for', async () => {
    client.setArgv(
      'firewall',
      'alerts',
      'list',
      '--since',
      new Date(Date.now() - 30 * 86_400_000).toISOString()
    );
    expect(await firewall(client)).toEqual(0);
    expect(firewallActivity.attackStatusQuery?.since).toEqual('7');
  });

  it('rejects a since after until', async () => {
    client.setArgv(
      'firewall',
      'alerts',
      'list',
      '--since',
      '2026-09-04T00:00:00.000Z',
      '--until',
      '2026-09-01T00:00:00.000Z'
    );
    expect(await firewall(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      '`--since` must be earlier than `--until`'
    );
  });

  it('reports JSON empty sections without treating empty as an error', async () => {
    client.setArgv('firewall', 'alerts', 'list', '--json');
    expect(await firewall(client)).toEqual(0);
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json).toEqual({ active: [], resolved: [] });
    expect(client.stderr.getFullOutput()).not.toContain('Observability Plus');
  });

  it('names a plan-gated o11y source instead of looking empty', async () => {
    const started = Date.now() - 3_600_000;
    useFirewallActivity({
      anomalies: [
        createAttackAnomaly({
          startTime: started,
          endTime: started + 600_000,
          denied: 10,
        }),
      ],
    });
    firewallActivity.alertsStatus = 402;

    client.setArgv('firewall', 'alerts', 'list');
    expect(await firewall(client)).toEqual(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('Observability Plus');
    expect(out).toContain(`team_dummy-firewall-test-project-${started}`);
  });

  it('fails when both alert sources error', async () => {
    firewallActivity.alertsStatus = 500;
    firewallActivity.attackStatusStatus = 500;

    client.setArgv('firewall', 'alerts', 'list');
    expect(await firewall(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toMatch(
      /Alerts unavailable|Failed to/
    );
  });

  it('fails when a plan-gated source is paired with a broken one', async () => {
    // Neither source answered, so there is nothing to say the window was
    // quiet with — and the plan is not why.
    firewallActivity.alertsStatus = 402;
    firewallActivity.attackStatusStatus = 500;

    client.setArgv('firewall', 'alerts', 'list');
    expect(await firewall(client)).toEqual(1);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('Attack status unavailable');
    expect(out).toContain('Observability Plus');
    expect(out).not.toContain('No alerts in this window.');
  });

  it('never reports the bare `Response Error` sentinel as the reason', async () => {
    // `responseError` substitutes that string when a failed response carried
    // no message, and it reaches `serverMessage` as an ordinary string — so
    // it wins any `serverMessage || fallback` and reads like a failure of
    // ours rather than the API's.
    firewallActivity.alertsStatus = 402;
    firewallActivity.attackStatusStatus = 500;
    firewallActivity.attackStatusBody = null;

    client.setArgv('firewall', 'alerts', 'list');
    expect(await firewall(client)).toEqual(1);
    const out = client.stderr.getFullOutput();
    expect(out).not.toContain('Response Error');
    expect(out).toContain("Couldn't load every alert source.");
  });

  it('keeps the working source and notes a partial 5xx', async () => {
    const started = Date.now() - 3_600_000;
    useFirewallActivity({
      anomalies: [
        createAttackAnomaly({
          startTime: started,
          endTime: started + 600_000,
          denied: 40,
        }),
      ],
    });
    firewallActivity.alertsStatus = 500;

    client.setArgv('firewall', 'alerts', 'list');
    expect(await firewall(client)).toEqual(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain("Couldn't load every alert source.");
    expect(out).toContain(`team_dummy-firewall-test-project-${started}`);
  });

  it('puts plan and source failures on JSON, not stdout prose', async () => {
    firewallActivity.alertsStatus = 402;
    client.setArgv('firewall', 'alerts', 'list', '--json');
    expect(await firewall(client)).toEqual(0);
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json.activityUnavailable).toEqual({
      reason: 'plan',
      message: 'Traffic and alerts need Observability Plus.',
    });
    expect(client.stdout.getFullOutput()).not.toContain(
      'Observability Plus is required'
    );
  });
});
