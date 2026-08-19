import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('firewall alerts', () => {
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

    const now = Date.now();
    client.scenario.get('/alerts/v3/groups', (_req: any, res: any) => {
      res.json([
        {
          id: 'group_1',
          alerts: [
            {
              id: 'alert_active',
              title: 'Custom Rule Spike',
              type: 'firewallCustomRule_anomaly',
              startedAt: now - 10 * 60_000,
              data: { count: 500, action: 'deny' },
            },
            {
              id: 'alert_resolved',
              title: 'System Rule Spike',
              type: 'firewallSystemRule_anomaly',
              startedAt: now - 14 * 3600_000,
              resolvedAt: now - 13 * 3600_000,
              data: { count: 313_000, action: 'challenge' },
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
              affectedHostMap: {
                'example.com': {
                  ddosAlerts: {
                    'sys_dos_mitigation:deny': {
                      atMinute: '1',
                      totalReqs: 1_900_000,
                    },
                  },
                },
              },
            },
            {
              ownerId: 'team_dummy',
              projectId: 'firewall-test-project',
              startTime: now - 14 * 3600_000,
              endTime: now - 13 * 3600_000,
              atMinute: 1,
              affectedHostMap: {
                'example.com': {
                  ddosAlerts: {
                    'sys_dos_mitigation:challenge': {
                      atMinute: '1',
                      totalReqs: 99_800,
                    },
                  },
                },
              },
            },
          ],
        });
      }
    );
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('firewall', 'alerts', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'firewall:alerts',
        },
      ]);
    });
  });

  it('lists active and resolved alerts', async () => {
    client.setArgv('firewall', 'alerts');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Active alerts');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('Active alerts');
    expect(fullOutput).toContain('Resolved alerts');
    expect(fullOutput).toContain('DDoS Mitigation');
    expect(fullOutput).toContain('Custom Rule Spike');
  });

  it('outputs JSON with --json', async () => {
    client.setArgv('firewall', 'alerts', '--json');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    const payload = JSON.parse((client.stdout as any).getFullOutput());
    expect(payload.active.length).toBeGreaterThan(0);
    expect(payload.resolved.length).toBeGreaterThan(0);
    expect(payload.attacksMitigated).toEqual(1);
  });
});
