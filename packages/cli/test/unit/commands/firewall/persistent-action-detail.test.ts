import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import type { FirewallActionRow } from '../../../../src/util/firewall/types';
import {
  useListFirewallConfigs,
  createConfig,
  createRule,
} from '../../../mocks/firewall';

const ROLLUP = 'vercel_firewall_action_count_sum';

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
    startTime: '2025-08-13T17:00:00Z',
    endTime: '2025-08-13T17:10:00Z',
    isActive: false,
    action_type: 'custom-action',
    action: 'deny',
    host: 'api.vercel.com',
    public_ip: '45.79.7.220',
    count: 9,
  },
];

function mockEventDetailApis(actions: FirewallActionRow[]) {
  client.scenario.get('/v1/security/firewall/events', (_req: any, res: any) => {
    res.json({ actions });
  });

  client.scenario.post('/v2/observability/query', (req: any, res: any) => {
    const body = req.body ?? {};
    const groupBy: string[] = body.groupBy ?? [];

    if (groupBy[0] === 'request_path') {
      res.json({
        summary: [
          { request_path: '/atom', [ROLLUP]: 2 },
          { request_path: '/api', [ROLLUP]: 1 },
        ],
        data: [],
        statistics: {},
      });
      return;
    }

    if (groupBy[0] === 'waf_rule_id') {
      res.json({
        summary: [{ waf_rule_id: 'rule_001', [ROLLUP]: 9 }],
        data: [],
        statistics: {},
      });
      return;
    }

    res.json({
      summary: [{ waf_action: 'challenge', [ROLLUP]: 48 }],
      data: [
        {
          timestamp: '2025-08-13T18:15:00.000Z',
          waf_action: 'challenge',
          [ROLLUP]: 48,
        },
      ],
      statistics: {},
    });
  });
}

describe('firewall persistent-actions inspect', () => {
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
        rules: [createRule(1)],
      }),
      null
    );
    mockEventDetailApis(SAMPLE_EVENTS);
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('firewall', 'persistent-actions', 'inspect', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'firewall:persistent-actions:inspect',
        },
      ]);
    });
  });

  it('prints persistent action metadata, timeseries, and top paths', async () => {
    client.setArgv('firewall', 'persistent-actions', 'inspect', '45.79.7.220');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Top Request Paths');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('Persistent action');
    expect(fullOutput).toContain('Start');
    expect(fullOutput).toContain('End');
    expect(fullOutput).toContain('challenge');
    expect(fullOutput).toContain('System Rule');
    expect(fullOutput).toContain('vercel.com');
    expect(fullOutput).toContain('45.79.7.220');
    expect(fullOutput).toContain('Requests by Action');
    expect(fullOutput).toContain('Top Request Paths');
    expect(fullOutput).toContain('/atom');
    expect(fullOutput).toContain(
      'firewall traffic --ip 45.79.7.220 --host vercel.com --action challenge --since 2025-08-13T18:10:46.000Z --until 2025-08-13T18:20:46.000Z'
    );
    expect(fullOutput).toContain(
      'firewall system-bypass add 45.79.7.220 --domain vercel.com'
    );
    expect(fullOutput).not.toContain('firewall rules add');
    expect(fullOutput).not.toContain('firewall rules edit');
    expect(fullOutput).toContain(
      'most recent of 2 matching persistent actions'
    );
  });

  it('disambiguates with --host and --action', async () => {
    client.setArgv(
      'firewall',
      'persistent-actions',
      'inspect',
      '45.79.7.220',
      '--host',
      'api.vercel.com',
      '--action',
      'deny'
    );
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('api.vercel.com');
    expect(fullOutput).toContain('Custom Rule');
    expect(fullOutput).not.toContain('most recent of');
    expect(fullOutput).toContain(
      'firewall traffic --ip 45.79.7.220 --host api.vercel.com --action deny'
    );
    expect(fullOutput).toContain('rule_001');
    expect(fullOutput).toContain('firewall rules edit rule_001');
    expect(fullOutput).not.toContain('firewall system-bypass add');
    expect(fullOutput).not.toContain('firewall rules add');
  });

  it('outputs JSON with --json', async () => {
    client.setArgv(
      'firewall',
      'persistent-actions',
      'inspect',
      '45.79.7.220',
      '--json'
    );
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    const payload = JSON.parse((client.stdout as any).getFullOutput());
    expect(payload.persistentAction.public_ip).toEqual('45.79.7.220');
    expect(payload.matchCount).toEqual(2);
    expect(payload.topPaths[0].path).toEqual('/atom');
    expect(payload.timeseries.groups[0].action).toEqual('challenge');
    expect(payload.attributedRule).toBeNull();
    expect((client.stdout as any).getFullOutput()).not.toContain(
      'Top Request Paths'
    );
  });

  it('errors when no persistent action matches', async () => {
    client.setArgv('firewall', 'persistent-actions', 'inspect', '9.9.9.9');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'No persistent action found for IP "9.9.9.9"'
    );
  });

  it('requires an IP argument', async () => {
    client.setArgv('firewall', 'persistent-actions', 'inspect');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain('Specify an IP address');
  });
});
