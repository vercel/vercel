import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useFirewallActivity,
  firewallActivity,
  createPersistentAction,
  FIREWALL_ROLLUP_COLUMN,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

const IP = '51.158.168.18';
const START = Date.UTC(2026, 7, 19, 21, 53, 0);
const END = Date.UTC(2026, 7, 19, 22, 3, 0);

describe('firewall persistent-actions inspect', () => {
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
      events: [
        createPersistentAction({
          startTime: START,
          endTime: END,
          ip: IP,
          count: 4,
        }),
      ],
      series: [
        {
          timestamp: new Date(START).toISOString(),
          waf_action: 'challenge',
          value: 1,
        },
        {
          timestamp: new Date(END).toISOString(),
          waf_action: 'log',
          value: 1,
        },
      ],
      actionSummary: [
        { waf_action: 'challenge', [FIREWALL_ROLLUP_COLUMN]: 1 },
        { waf_action: 'log', [FIREWALL_ROLLUP_COLUMN]: 1 },
      ],
      topPaths: [
        { request_path: '/sso-api', [FIREWALL_ROLLUP_COLUMN]: 6 },
        { request_path: '/login', [FIREWALL_ROLLUP_COLUMN]: 4 },
      ],
    });
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('firewall', 'persistent-actions', 'inspect', '--help');
      expect(await firewall(client)).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:persistent-actions', value: 'persistent-actions' },
        { key: 'flag:help', value: 'firewall:persistent-actions:inspect' },
      ]);
    });
  });

  it('requires an IP', async () => {
    client.setArgv('firewall', 'persistent-actions', 'inspect');
    expect(await firewall(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain('IP is required');
  });

  it('keeps a floor under the traffic window for an action that just began', async () => {
    // The projected expiry is clamped to now so the chart carries no empty
    // future buckets, which for an action seconds old leaves a window of
    // nothing — and observability rejects `startTime >= endTime`.
    const now = Date.now();
    useFirewallActivity({
      events: [
        createPersistentAction({
          startTime: now,
          endTime: now + 1_800_000,
          ip: IP,
          count: 1,
          isActive: true,
        }),
      ],
    });

    client.setArgv('firewall', 'persistent-actions', 'inspect', IP);
    expect(await firewall(client)).toEqual(0);

    const query = firewallActivity.queries[0];
    const startTime = new Date(query.startTime as string).getTime();
    const endTime = new Date(query.endTime as string).getTime();
    expect(endTime - startTime).toBeGreaterThanOrEqual(60_000);
    expect(query.granularity).toEqual({ minutes: 1 });
  });

  it('rejects a non-IP argument', async () => {
    client.setArgv('firewall', 'persistent-actions', 'inspect', 'not-an-ip');
    expect(await firewall(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain('valid IP address');
  });

  it('inspects an IP and issues one events GET plus two metrics queries', async () => {
    client.setArgv(
      'firewall',
      'persistent-actions',
      'inspect',
      IP,
      '--host',
      'vercel.com',
      '--action',
      'challenge',
      '--paths'
    );
    expect(await firewall(client)).toEqual(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('Persistent action');
    expect(out).toContain(IP);
    expect(out).toContain('vercel.com');
    // Title-cased for display, as every other firewall surface renders it.
    expect(out).toContain('Challenge');
    expect(out).toContain('Requests by Action');
    expect(out).toContain('Top Request Paths');
    expect(out).toContain('/sso-api');
    expect(out).toContain('/login');
    expect(out).not.toContain('most recent of');

    expect(firewallActivity.eventsQuery?.hosts).toBe('vercel.com');
    expect(firewallActivity.queries).toHaveLength(2);
    const groupBys = firewallActivity.queries.map(q => q.groupBy?.[0]).sort();
    expect(groupBys).toEqual(['request_path', 'waf_action']);
    for (const query of firewallActivity.queries) {
      expect(query.filter).toContain(IP);
      expect(query.filter).toContain('vercel.com');
      // Scoped to the action being shown, not the window it was found in.
      // Querying the search window would describe traffic the rows above do
      // not — every other action from this IP in that window included.
      expect(query.startTime).toEqual(new Date(START).toISOString());
      expect(query.endTime).toEqual(new Date(END).toISOString());
    }

    // Rows with no path cannot appear in a group-by-path result, so excluding
    // them server-side is work the query need not do. The by-action query has
    // no such exclusion — a mitigation with no path still counts there.
    const paths = firewallActivity.queries.find(
      q => q.groupBy?.[0] === 'request_path'
    );
    const byAction = firewallActivity.queries.find(
      q => q.groupBy?.[0] === 'waf_action'
    );
    expect(paths?.filter).toContain("request_path ne ''");
    expect(byAction?.filter).not.toContain("request_path ne ''");
  });

  it('skips the top-paths query unless asked', async () => {
    client.setArgv('firewall', 'persistent-actions', 'inspect', IP);
    expect(await firewall(client)).toEqual(0);

    // Grouping by path costs several times the rest of the command, and the
    // window barely affects it, so it is opt-in.
    expect(firewallActivity.queries).toHaveLength(1);
    expect(firewallActivity.queries[0].groupBy).toEqual(['waf_action']);

    const out = client.stderr.getFullOutput();
    expect(out).not.toContain('Top Request Paths');
    // Still discoverable from the output that skipped it.
    expect(out).toContain('--paths');
  });

  it('omits paths from JSON when not requested', async () => {
    client.setArgv('firewall', 'persistent-actions', 'inspect', IP, '--json');
    expect(await firewall(client)).toEqual(0);

    // Absent rather than null: null means the query ran and could not answer.
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json).not.toHaveProperty('paths');
  });

  it('scopes an ongoing action to now, not its projected expiry', async () => {
    const startedAt = Date.now() - 600_000;
    useFirewallActivity({
      events: [
        createPersistentAction({
          startTime: startedAt,
          // Still in force, so the API reports an expiry in the future.
          endTime: Date.now() + 600_000,
          ip: IP,
          isActive: true,
        }),
      ],
    });

    client.setArgv('firewall', 'persistent-actions', 'inspect', IP);
    expect(await firewall(client)).toEqual(0);

    // A future end would chart empty buckets that have not happened yet.
    for (const query of firewallActivity.queries) {
      expect(new Date(query.endTime!).getTime()).toBeLessThanOrEqual(
        Date.now()
      );
    }
  });

  it('notes when several actions match the IP', async () => {
    useFirewallActivity({
      events: [
        createPersistentAction({
          startTime: START,
          endTime: END,
          ip: IP,
          count: 4,
        }),
        createPersistentAction({
          startTime: START - 600_000,
          endTime: START,
          ip: IP,
          action: 'deny',
          count: 10,
        }),
        createPersistentAction({
          startTime: START - 1_200_000,
          endTime: START,
          ip: IP,
          count: 2,
        }),
        createPersistentAction({
          startTime: START,
          endTime: END,
          ip: IP,
          count: 1,
        }),
      ],
    });
    client.setArgv('firewall', 'persistent-actions', 'inspect', IP);
    expect(await firewall(client)).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain(
      'Showing the most recent of 4 matching persistent actions.'
    );
  });

  it('returns not found for an unknown IP', async () => {
    client.setArgv('firewall', 'persistent-actions', 'inspect', '1.1.1.1');
    expect(await firewall(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'No persistent action found for "1.1.1.1"'
    );
    expect(client.stderr.getFullOutput()).toContain(
      'firewall persistent-actions list'
    );
  });

  it('prints the plan note when metrics are 402, and still shows the header', async () => {
    firewallActivity.queryStatus = 402;
    client.setArgv('firewall', 'persistent-actions', 'inspect', IP);
    expect(await firewall(client)).toEqual(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('Persistent action');
    expect(out).toContain(IP);
    expect(out).toContain('Traffic and alerts need Observability Plus.');
    expect(out).not.toContain('Requests by Action');
  });
});
