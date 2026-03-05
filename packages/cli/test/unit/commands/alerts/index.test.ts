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
    expect(client.stderr.getFullOutput()).toContain('schema');
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
          alerts: [{ title: 'Spike in requests' }],
        },
      ]);
    });

    client.setArgv('alerts');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    expect(requestQuery.teamId).toBe('team_dummy');
    expect(requestQuery.projectId).toBe('prj_alerts');
    expect(client.stderr.getFullOutput()).toContain('Spike in requests');
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

  it('supports explicit --from and --to range', async () => {
    let requestQuery: any;
    client.scenario.get('/alerts/v3/groups', (req, res) => {
      requestQuery = req.query;
      res.json([]);
    });

    client.setArgv(
      'alerts',
      '--from',
      '2026-03-03T00:00:00.000Z',
      '--to',
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

  it('shows schema with available type filters', async () => {
    let requestQuery: any;
    client.scenario.get('/alerts/v2/types', (req, res) => {
      requestQuery = req.query;
      res.json([
        {
          id: 'function_invocations',
          type: 'usage_anomaly',
          title: 'Function Invocations',
          unit: 'Invocations',
        },
        {
          id: '5xx',
          type: 'error_anomaly',
          title: '5xx status codes',
          unit: 'Requests',
        },
      ]);
    });

    client.setArgv('alerts', 'schema');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    expect(requestQuery.teamId).toBe('team_dummy');
    expect(client.stderr.getFullOutput()).toContain(
      'Filter values for --type: usage_anomaly, error_anomaly'
    );
    expect(client.stderr.getFullOutput()).toContain('function_invocations');
  });

  it('outputs schema json with --format=json', async () => {
    client.scenario.get('/alerts/v2/types', (_req, res) => {
      res.json([
        {
          id: 'function_invocations',
          type: 'usage_anomaly',
          title: 'Function Invocations',
          unit: 'Invocations',
        },
      ]);
    });

    client.setArgv('alerts', 'schema', '--format=json');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    const stdout = JSON.parse(client.stdout.getFullOutput());
    expect(stdout.types).toEqual(['usage_anomaly']);
    expect(stdout.filters).toHaveLength(1);
  });
});
