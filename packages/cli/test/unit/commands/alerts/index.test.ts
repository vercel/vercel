import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import alerts from '../../../../src/commands/alerts';
import * as linkModule from '../../../../src/util/projects/link';
import * as getScopeModule from '../../../../src/util/get-scope';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedGetScope = vi.mocked(getScopeModule.default);

function mockLinkedProject() {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: 'prj_alerts',
      name: 'alerts-project',
      accountId: 'team_dummy',
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    org: {
      id: 'team_dummy',
      slug: 'my-team',
      type: 'team',
    },
  });
}

function mockTeamScope() {
  mockedGetScope.mockResolvedValue({
    contextName: 'my-team',
    team: { id: 'team_dummy', slug: 'my-team' } as any,
    user: { id: 'user_dummy' } as any,
  });
}

describe('alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
  });

  it('prints help output', async () => {
    client.setArgv('alerts', '--help');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'List alerts for a project or team'
    );
    expect(client.stderr.getFullOutput()).toContain('--project');
  });

  it('lists alerts for linked project by default', async () => {
    let requestQuery: any;
    client.scenario.get('/alerts/v3/groups', (req, res) => {
      requestQuery = req.query;
      res.json([
        {
          id: 'ag_1',
          type: 'usage_anomaly',
          status: 'active',
          recordedStartedAt: '2026-03-06T00:00:00.000Z',
          startedAt: '2026-03-06T00:00:00.000Z',
          alerts: [{ title: 'Spike in requests', route: '/api/logs' }],
        },
      ]);
    });

    client.setArgv('alerts');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    expect(requestQuery.teamId).toBe('team_dummy');
    expect(requestQuery.projectId).toBe('prj_alerts');
    expect(client.stderr.getFullOutput()).toContain('Title');
    expect(client.stderr.getFullOutput()).toContain('StartedAt');
    expect(client.stderr.getFullOutput()).toContain('Status');
    expect(client.stderr.getFullOutput()).toContain('Alerts');
    expect(client.stderr.getFullOutput()).toContain('Spike in requests');
    expect(client.stderr.getFullOutput()).toContain('Mar');
    expect(client.stderr.getFullOutput()).toContain('2026');
  });

  it('renders resolved status as duration since startedAt', async () => {
    client.scenario.get('/alerts/v3/groups', (_req, res) => {
      res.json([
        {
          id: 'ag_2',
          type: 'error_anomaly',
          status: 'resolved',
          startedAt: '2026-03-06T00:00:00.000Z',
          resolvedAt: '2026-03-06T01:30:00.000Z',
          alerts: [{ title: '5xx on /api/logs', route: '/api/logs' }],
        },
      ]);
    });

    client.setArgv('alerts');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('resolved after');
  });

  it('prefers ai title when available', async () => {
    client.scenario.get('/alerts/v3/groups', (_req, res) => {
      res.json([
        {
          id: 'ag_3',
          type: 'error_anomaly',
          status: 'active',
          title: 'Fallback title',
          ai: { title: 'AI generated title' },
        },
      ]);
    });

    client.setArgv('alerts');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('AI generated title');
    expect(client.stderr.getFullOutput()).not.toContain('Fallback title');
  });

  it('supports --all and does not set projectId', async () => {
    let requestQuery: any;
    client.scenario.get('/alerts/v3/groups', (req, res) => {
      requestQuery = req.query;
      res.json([]);
    });

    client.setArgv('alerts', '--all');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    expect(requestQuery.teamId).toBe('team_dummy');
    expect(requestQuery.projectId).toBeUndefined();
    expect(requestQuery.from).toBeDefined();
    expect(requestQuery.to).toBeDefined();
  });

  it('supports explicit --since and --until range', async () => {
    let requestQuery: any;
    client.scenario.get('/alerts/v3/groups', (req, res) => {
      requestQuery = req.query;
      res.json([]);
    });

    client.setArgv(
      'alerts',
      '--since',
      '2026-03-03T00:00:00.000Z',
      '--until',
      '2026-03-04T00:00:00.000Z'
    );

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    expect(requestQuery.from).toBe('2026-03-03T00:00:00.000Z');
    expect(requestQuery.to).toBe('2026-03-04T00:00:00.000Z');
  });

  it('outputs json with --format=json', async () => {
    client.scenario.get('/alerts/v3/groups', (_req, res) => {
      res.json([
        {
          id: 'ag_1',
          type: 'usage_anomaly',
          status: 'active',
          alerts: [{ title: 'Spike in requests' }],
        },
      ]);
    });

    client.setArgv('alerts', '--format=json');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    const stdout = JSON.parse(client.stdout.getFullOutput());
    expect(stdout.groups).toHaveLength(1);
    expect(stdout.groups[0].id).toBe('ag_1');
  });

  it('returns error for mutually exclusive flags', async () => {
    client.setArgv('alerts', '--all', '--project', 'my-project');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Cannot specify both --all and --project'
    );
  });

  it('returns error when --since is after --until', async () => {
    client.setArgv(
      'alerts',
      '--since',
      '2026-03-05T00:00:00.000Z',
      '--until',
      '2026-03-04T00:00:00.000Z'
    );

    const exitCode = await alerts(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      '`--since` must be earlier than `--until`.'
    );
  });

  it('returns error for invalid --since format', async () => {
    client.setArgv('alerts', '--since', 'not-a-date');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Invalid time format');
  });

  it('returns error for out-of-range --limit', async () => {
    client.setArgv('alerts', '--limit', '1001');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      '`--limit` must be an integer between 1 and 1000.'
    );
  });
});
