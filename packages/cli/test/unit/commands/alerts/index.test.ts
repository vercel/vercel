import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints help output', async () => {
    client.setArgv('alerts', '--help');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    const helpOut = client.stderr.getFullOutput();
    expect(helpOut).toContain('rules');
    expect(helpOut).toContain('List alert groups');
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
          ai: { title: 'Spike in requests' },
          recordedStartedAt: 1772755200000,
          alerts: [
            {
              startedAt: 1772755200000,
              status: 'active',
              type: 'usage_anomaly',
            },
          ],
        },
      ]);
    });

    client.setArgv('alerts');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    expect(requestQuery.teamId).toBe('team_dummy');
    expect(requestQuery.projectId).toBe('prj_alerts');
    expect(client.stderr.getFullOutput()).toContain('Title');
    expect(client.stderr.getFullOutput()).toContain('Group id');
    expect(client.stderr.getFullOutput()).toContain('Started At');
    expect(client.stderr.getFullOutput()).toContain('Status');
    expect(client.stderr.getFullOutput()).toContain('Alerts');
    expect(client.stderr.getFullOutput()).toContain('Spike in requests');
    expect(client.stderr.getFullOutput()).toContain('ag_1');
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
          recordedStartedAt: 1772755200000,
          alerts: [
            {
              title: '5xx on /api/logs',
              route: '/api/logs',
              startedAt: 1772755200000,
              resolvedAt: 1772760600000,
            },
          ],
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

  it('emits agent JSON when --project is missing its value in non-interactive mode', async () => {
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as () => never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    client.setArgv('alerts', '--project', '--cwd', '/tmp', '--non-interactive');
    client.nonInteractive = true;

    await expect(alerts(client)).rejects.toThrow('exit:1');
    const payload = JSON.parse(
      logSpy.mock.calls[logSpy.mock.calls.length - 1][0] as string
    );
    expect(payload.status).toBe('error');
    expect(payload.reason).toBe('invalid_arguments');
    expect(payload.message).toMatch(/--project/i);
    expect(payload.next[0].command).toContain('alerts --project <name-or-id>');
    expect(payload.next[0].command).toContain('--cwd /tmp');
  });

  it('emits agent JSON for list validation errors in non-interactive mode', async () => {
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as () => never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    client.setArgv('alerts', '--all', '--project', 'x', '--non-interactive');
    client.nonInteractive = true;

    await expect(alerts(client)).rejects.toThrow('exit:1');
    const payload = JSON.parse(
      logSpy.mock.calls[logSpy.mock.calls.length - 1][0] as string
    );
    expect(payload.status).toBe('error');
    expect(payload.reason).toBe('invalid_arguments');
    expect(payload.message).toContain('Cannot specify both');
    expect(payload.next[0].command).toContain('alerts --help');
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
      '`--limit` must be an integer between 1 and 100.'
    );
  });

  it('inspect fetches a single alert group for the linked project', async () => {
    let inspectPath = '';
    client.scenario.get('/alerts/v3/groups/:groupId', (req, res) => {
      inspectPath = req.path;
      res.json({ id: 'grp_x', status: 'active' });
    });

    client.setArgv('alerts', 'inspect', 'grp_x');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    expect(inspectPath).toContain('/alerts/v3/groups/grp_x');
    expect(client.stdout.getFullOutput()).toContain('"id"');
    expect(client.stdout.getFullOutput()).toContain('grp_x');
  });
});
