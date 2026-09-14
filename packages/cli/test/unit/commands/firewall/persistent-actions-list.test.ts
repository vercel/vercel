import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useFirewallActivity,
  firewallActivity,
  createPersistentAction,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

const START = Date.UTC(2026, 7, 19, 21, 50, 0);
const END = Date.UTC(2026, 7, 19, 22, 0, 0);

describe('firewall persistent-actions list', () => {
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
      client.setArgv('firewall', 'persistent-actions', 'list', '--help');
      expect(await firewall(client)).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:persistent-actions', value: 'persistent-actions' },
        { key: 'flag:help', value: 'firewall:persistent-actions:list' },
      ]);
    });
  });

  it('never posts observability queries', async () => {
    client.setArgv('firewall', 'persistent-actions', 'list');
    expect(await firewall(client)).toEqual(0);
    expect(firewallActivity.queries).toEqual([]);
  });

  it('shows an empty window', async () => {
    client.setArgv('firewall', 'persistent-actions', 'list');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput(
      'No persistent actions in this window.'
    );
    expect(await exitCodePromise).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain('past 1h, UTC');
  });

  it('summarises what is in force, over the window and not the page', async () => {
    useFirewallActivity({
      events: [
        // Two actions on one IP: distinct clients, not rows, is the useful
        // count, so this must not read as two challenged IPs.
        createPersistentAction({ ip: '1.1.1.1', isActive: true }),
        createPersistentAction({ ip: '1.1.1.1', isActive: true }),
        createPersistentAction({ ip: '2.2.2.2', isActive: true }),
        createPersistentAction({
          ip: '3.3.3.3',
          action: 'deny',
          isActive: true,
        }),
        // Expired, so it counts towards neither.
        createPersistentAction({ ip: '4.4.4.4', isActive: false }),
      ],
    });

    client.setArgv('firewall', 'persistent-actions', 'list', '--limit', '1');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Persistent actions');
    expect(await exitCodePromise).toEqual(0);

    const out = client.stderr.getFullOutput();
    // A one-row page must not shrink the summary to that row.
    expect(out).toContain('Challenging 2 IPs');
    expect(out).toContain('Blocking 1 IP');
    expect(out).toContain('4 currently applied');
  });

  it('lists actions and notes a truncated page', async () => {
    useFirewallActivity({
      events: [
        createPersistentAction({
          startTime: START,
          endTime: END,
          ip: '64.100.254.100',
          count: 2,
        }),
        createPersistentAction({
          startTime: START - 60_000,
          endTime: END,
          action: 'deny',
          ip: '187.15.125.19',
          count: 10,
        }),
        createPersistentAction({
          startTime: START - 120_000,
          endTime: END,
          ip: '20.229.151.116',
          count: 40,
        }),
      ],
    });

    client.setArgv('firewall', 'persistent-actions', 'list', '--limit', '2');
    expect(await firewall(client)).toEqual(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('64.100.254.100');
    expect(out).toContain('187.15.125.19');
    expect(out).not.toContain('20.229.151.116');
    expect(out).toContain(
      'Showing 2 of 3. Raise --limit, or narrow with --since and --until.'
    );
    expect(out).toContain('Aug 19 21:50 UTC');
  });

  it('defaults the events window to the last hour', async () => {
    client.setArgv('firewall', 'persistent-actions', 'list');
    expect(await firewall(client)).toEqual(0);
    const start = Number(firewallActivity.eventsQuery?.startTimestamp);
    const end = Number(firewallActivity.eventsQuery?.endTimestamp);
    expect(end - start).toBe(60 * 60 * 1000);
  });

  it('passes --since 6h to the events window', async () => {
    client.setArgv('firewall', 'persistent-actions', 'list', '--since', '6h');
    expect(await firewall(client)).toEqual(0);
    const start = Number(firewallActivity.eventsQuery?.startTimestamp);
    const end = Number(firewallActivity.eventsQuery?.endTimestamp);
    expect(end - start).toBe(6 * 60 * 60 * 1000);
  });

  it('prints JSON without a truncated-page footer', async () => {
    useFirewallActivity({
      events: [
        createPersistentAction({
          startTime: START,
          endTime: END,
          ip: '64.100.254.100',
          count: 2,
        }),
        createPersistentAction({
          startTime: START - 60_000,
          endTime: END,
          ip: '187.15.125.19',
          count: 10,
        }),
      ],
    });
    client.setArgv(
      'firewall',
      'persistent-actions',
      'list',
      '--json',
      '--limit',
      '1'
    );
    expect(await firewall(client)).toEqual(0);
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json.shown).toBe(1);
    expect(json.total).toBe(2);
    expect(json.actions[0].ip).toBe('64.100.254.100');
    // Mapped, not passed through: ISO timestamps and the mitigation under
    // `action`, with the rule kind kept separately.
    expect(json.actions[0].action).toBe('challenge');
    expect(json.actions[0].ruleType).toBe('system');
    expect(json.actions[0].startTime).toMatch(/Z$/);
  });

  it('fails with the plan note when events are 402', async () => {
    firewallActivity.eventsStatus = 402;
    client.setArgv('firewall', 'persistent-actions', 'list');
    expect(await firewall(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain('Observability Plus');
  });
});
