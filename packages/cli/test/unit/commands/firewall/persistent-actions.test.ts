import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import type { FirewallActionRow } from '../../../../src/util/firewall/types';

const SAMPLE_EVENTS: FirewallActionRow[] = [
  {
    startTime: '2025-08-13T18:10:46Z',
    endTime: '2025-08-13T18:20:46Z',
    isActive: false,
    action_type: 'system-action',
    action: 'challenge',
    host: 'vercel.com',
    public_ip: '45.79.7.220',
    count: 48,
  },
  {
    startTime: '2025-08-13T18:10:21Z',
    endTime: '2025-08-13T18:20:22Z',
    isActive: false,
    action_type: 'system-action',
    action: 'deny',
    host: 'vercel.com',
    public_ip: '13.38.73.16',
    count: 170,
  },
  {
    startTime: '2025-08-13T17:00:00Z',
    endTime: '2025-08-13T17:10:00Z',
    isActive: false,
    action_type: 'custom-action',
    action: 'challenge',
    host: 'api.vercel.com',
    public_ip: '1.2.3.4',
    count: 9,
  },
];

describe('firewall persistent-actions', () => {
  let actions: FirewallActionRow[];

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
    actions = SAMPLE_EVENTS;
    client.scenario.get(
      '/v1/security/firewall/events',
      (_req: any, res: any) => {
        res.json({ actions });
      }
    );
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('firewall', 'persistent-actions', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'firewall:persistent-actions',
        },
      ]);
    });

    it('tracks the events alias', async () => {
      client.setArgv('firewall', 'events', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'firewall:events',
        },
      ]);
    });

    it('tracks the mitigations alias', async () => {
      client.setArgv('firewall', 'mitigations', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'firewall:mitigations',
        },
      ]);
    });
  });

  it('lists persistent actions in a table with Inspect and Traffic hints', async () => {
    client.setArgv('firewall', 'persistent-actions');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Persistent actions');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('past 1h');
    expect(fullOutput).toMatch(
      /Type\s+Action\s+Hostname\s+IP Address\s+Start\s+End\s+Requests/
    );
    expect(fullOutput).toContain('System Rule');
    expect(fullOutput).toContain('challenge');
    expect(fullOutput).toContain('vercel.com');
    expect(fullOutput).toContain('45.79.7.220');
    expect(fullOutput).toContain('48');
    expect(fullOutput).toContain('Custom Rule');
    expect(fullOutput).toContain(
      'firewall persistent-actions inspect 45.79.7.220 --host vercel.com --action challenge --since 2025-08-13T18:10:46.000Z --until 2025-08-13T18:20:46.000Z'
    );
    expect(fullOutput).toContain(
      'firewall traffic --ip 45.79.7.220 --host vercel.com --action challenge --since 2025-08-13T18:10:46.000Z --until 2025-08-13T18:20:46.000Z'
    );
    expect(fullOutput).not.toContain('No persistent actions found.');
  });

  it('accepts the events alias', async () => {
    client.setArgv('firewall', 'events');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain('45.79.7.220');
  });

  it('accepts the mitigations alias', async () => {
    client.setArgv('firewall', 'mitigations');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain('45.79.7.220');
  });

  it('outputs JSON with --json', async () => {
    client.setArgv('firewall', 'persistent-actions', '--json');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    const payload = JSON.parse((client.stdout as any).getFullOutput());
    expect(payload.actions).toHaveLength(3);
    expect(payload.total).toEqual(3);
    expect(payload.actions[0].public_ip).toEqual('45.79.7.220');
    expect(payload.period.start).toBeTruthy();
    expect(payload.period.end).toBeTruthy();
    expect((client.stdout as any).getFullOutput()).not.toMatch(
      /Persistent actions|Inspect|Traffic/
    );
  });

  it('filters by --type system', async () => {
    client.setArgv('firewall', 'persistent-actions', '--type', 'system');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('45.79.7.220');
    expect(fullOutput).toContain('13.38.73.16');
    expect(fullOutput).not.toContain('1.2.3.4');
    expect(fullOutput).not.toContain('Custom Rule');
  });

  it('filters by --action challenge', async () => {
    client.setArgv('firewall', 'persistent-actions', '--action', 'challenge');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('45.79.7.220');
    expect(fullOutput).toContain('1.2.3.4');
    expect(fullOutput).not.toContain('13.38.73.16');
  });

  it('searches by IP, hostname, or action', async () => {
    client.setArgv(
      'firewall',
      'persistent-actions',
      '--search',
      'api.vercel.com'
    );
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('1.2.3.4');
    expect(fullOutput).not.toContain('45.79.7.220');
  });

  it('limits rows and shows a remaining-count footer', async () => {
    client.setArgv('firewall', 'persistent-actions', '--limit', '1');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('45.79.7.220');
    expect(fullOutput).not.toContain('13.38.73.16');
    expect(fullOutput).toContain(
      'Showing 1 of 3. Re-run with --limit 3 to see all.'
    );
  });

  it('prints an empty state when there are no persistent actions', async () => {
    actions = [];
    client.setArgv('firewall', 'persistent-actions');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain(
      'No persistent actions found.'
    );
    expect(client.stderr.getFullOutput()).not.toContain('Detail');
  });

  it('prints a filtered empty state', async () => {
    client.setArgv('firewall', 'persistent-actions', '--ip', '9.9.9.9');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain(
      'No persistent actions match the current filters.'
    );
  });

  it('outputs empty JSON as actions: []', async () => {
    actions = [];
    client.setArgv('firewall', 'persistent-actions', '--json');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    const payload = JSON.parse((client.stdout as any).getFullOutput());
    expect(payload.actions).toEqual([]);
    expect(payload.total).toEqual(0);
  });

  it('notes hobby redaction and hints from the first usable row', async () => {
    actions = [
      {
        startTime: '2025-08-12T18:10:46Z',
        endTime: '2025-08-12T18:20:46Z',
        isActive: false,
        action_type: '***',
        action: '***',
        host: '***',
        public_ip: '***',
        count: 12,
      },
      SAMPLE_EVENTS[0],
    ];
    client.setArgv('firewall', 'persistent-actions');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain(
      'Some older persistent actions are redacted on the Hobby plan.'
    );
    expect(fullOutput).toContain('***');
    expect(fullOutput).toContain(
      'firewall persistent-actions inspect 45.79.7.220'
    );
  });

  it('rejects an unknown --type', async () => {
    client.setArgv('firewall', 'persistent-actions', '--type', 'ddos');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      "Couldn't filter by type. Use --type system or --type customer."
    );
  });
});
