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

  it('renders plain resolved status when resolvedAt is missing', async () => {
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
              startedAt: 1772755200000,
            },
          ],
        },
      ]);
    });

    client.setArgv('alerts');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('resolved');
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
  });

  it('renders custom alert titles from the API without crowding the table', async () => {
    let requestQuery: any;
    const longTitle =
      'Checkout request volume with a very long custom alert title that would otherwise stretch the alerts table beyond a comfortable width';
    client.scenario.get('/alerts/v3/groups', (req, res) => {
      requestQuery = req.query;
      res.json([
        {
          id: 'ag_custom',
          type: 'custom_alert',
          status: 'active',
          recordedStartedAt: 1772755200000,
          alerts: [
            {
              id: 'al_custom',
              startedAt: 1772755200000,
              status: 'active',
              type: 'custom_alert',
              pipe: 'customAlert',
              title: longTitle,
              eventLabel: 'Requests',
              measureLabel: 'Count',
              unit: 'requests',
              formattedValues: {
                formattedCount: '150',
                formattedAvg: '100',
                formattedThreshold: '120',
              },
              data: {
                triggerType: 'threshold',
                triggerOperator: 'gt',
              },
            },
          ],
        },
      ]);
    });

    client.setArgv('alerts', '--type', 'custom_alert');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    expect(requestQuery.types).toBe('custom_alert');
    const output = client.stderr.getFullOutput();
    expect(output).toContain(`${longTitle.slice(0, 77)}...`);
    expect(output).toContain('custom_alert');
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
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Alert group');
    expect(output).toContain('grp_x');
    expect(output).toContain('No alerts in this group.');
    expect(client.stdout.getFullOutput()).not.toContain('"id"');
  });

  it('passes nested inspect args when global flags precede alerts', async () => {
    let inspectPath = '';
    client.scenario.get('/alerts/v3/groups/:groupId', (req, res) => {
      inspectPath = req.path;
      res.json({ id: 'grp_x', status: 'active' });
    });

    client.setArgv('--debug', 'alerts', 'inspect', 'grp_x');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    expect(inspectPath).toContain('/alerts/v3/groups/grp_x');
  });

  it('inspect folds single-alert metadata into the group summary', async () => {
    client.scenario.get('/alerts/v3/groups/:groupId', (_req, res) => {
      res.json({
        id: 'ag_build',
        type: 'buildTime_anomaly',
        status: 'resolved',
        recordedStartedAt: 1772755200000,
        alerts: [
          {
            id: 'al_build',
            startedAt: 1772755200000,
            resolvedAt: 1772758800000,
            status: 'resolved',
            type: 'buildTime_anomaly',
            title: 'Build Time',
            unit: 'seconds',
            formattedValues: {
              changeAmount: '1.75x',
              changeDirection: 'increase',
              formattedAvg: '106.88',
              formattedCount: '187.44',
            },
            rules: ['ar_default'],
            data: {
              deploymentId: 'dpl_123',
              zscore: 5.15,
            },
          },
        ],
      });
    });

    client.setArgv('alerts', 'inspect', 'ag_build');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output.match(/Build Time/g)).toHaveLength(1);
    expect(output).toContain('Alert id');
    expect(output).toContain('al_build');
    expect(output).toContain('Rule id');
    expect(output).toContain('ar_default');
    expect(output).toContain('Deployment ID');
    expect(output).toContain('dpl_123');
    expect(output).toContain('Signals');
    expect(output).toContain('187.44 seconds');
  });

  it('inspect renders custom alert signals and query', async () => {
    const sonarQuery = {
      event: 'incomingRequest',
      rollups: {
        value: {
          aggregation: 'avg',
          measure: 'successRate',
        },
      },
      groupBy: ['requestHostname'],
      filter: "environment eq 'production'",
      granularity: { hours: 1 },
    };

    client.scenario.get('/alerts/v3/groups/:groupId', (_req, res) => {
      res.json({
        id: 'ag_custom',
        type: 'custom_alert',
        status: 'active',
        recordedStartedAt: 1772755200000,
        alerts: [
          {
            id: 'al_custom',
            startedAt: 1772755200000,
            status: 'active',
            type: 'custom_alert',
            title: 'Checkout conversion dropped',
            eventLabel: 'Requests',
            measureLabel: 'Success Rate',
            unit: '%',
            sonarQuery,
            formattedValues: {
              changeAmount: '7.69x',
              changeDirection: 'increase',
              formattedAvg: '13',
              formattedCount: '100',
              formattedThreshold: '3.5',
            },
            data: {
              fields: {
                requestHostname:
                  'backend-r9y2e7ore-factory-long-hostname.vercel.app',
              },
              ruleId: 'ar_custom',
              triggerOperator: 'gt',
              triggerThreshold: 3.5,
              triggerType: 'anomaly',
              sonarQuery,
              zscore: 3.47,
            },
          },
        ],
      });
    });

    client.setArgv('alerts', 'inspect', 'ag_custom');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Checkout conversion dropped');
    expect(output).toContain('Signals');
    expect(output).toContain('Observed Value');
    expect(output).toContain('100%');
    expect(output).toContain('7-Day Baseline');
    expect(output).toContain('13%');
    expect(output).toContain('Observed Deviation');
    expect(output).toContain('3.47 z-score');
    expect(output).toContain('Threshold');
    expect(output).toContain('> 3.5 z-score');
    expect(output).toContain('Request Hostname');
    expect(output).toContain('backend-r9y2e7ore-factory');
    expect(output).toContain('Query');
    expect(output).toContain('Event');
    expect(output).toContain('Requests');
    expect(output).toContain('Measure');
    expect(output).toContain('Success Rate');
    expect(output).toContain('Aggregation');
    expect(output).toContain('Average');
    expect(output).toContain('Granularity');
    expect(output).toContain('1h');
    expect(output).toContain('Group by');
    expect(output).toContain('Request Hostname');
    expect(output).toContain('Filter by');
    expect(output).toContain("environment eq 'production'");
    expect(output).toContain('Rule id');
    expect(output).toContain('ar_custom');
  });

  it('inspect renders custom alert ratio query filters', async () => {
    const sonarQuery = {
      event: 'incomingRequest',
      rollups: {
        errors: {
          aggregation: 'sum',
          measure: 'count',
          filter: 'statusCode ge 500',
        },
        requests: {
          aggregation: 'sum',
          measure: 'count',
          filter: "requestPath eq '/api'",
        },
      },
      groupBy: ['requestHostname'],
      granularity: { minutes: 5 },
    };

    client.scenario.get('/alerts/v3/groups/:groupId', (_req, res) => {
      res.json({
        id: 'ag_ratio',
        type: 'custom_alert',
        status: 'active',
        alerts: [
          {
            id: 'al_ratio',
            startedAt: 1772755200000,
            status: 'active',
            type: 'custom_alert',
            title: 'Error rate',
            eventLabel: 'Requests',
            measureLabel: 'errors / requests',
            unit: 'ratio',
            sonarQuery,
            formattedValues: {
              changeAmount: '2x',
              changeDirection: 'increase',
              formattedAvg: '0.002278',
              formattedCount: '0.01744',
              formattedThreshold: '0.01',
            },
            data: {
              fields: {
                requestHostname: 'api.vercel.com',
              },
              formula: {
                operator: 'divide',
                left: 'errors',
                right: 'requests',
              },
              minThreshold: 50,
              ruleId: 'ar_ratio',
              sonarQuery,
              triggerOperator: 'gt',
              triggerThreshold: 0.01,
              triggerType: 'threshold',
            },
          },
        ],
      });
    });

    client.setArgv('alerts', 'inspect', 'ag_ratio');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Observed Value');
    expect(output).toContain('1.74%');
    expect(output).toContain('Baseline');
    expect(output).toContain('0.23%');
    expect(output).toContain('Threshold');
    expect(output).toContain('> 1%');
    expect(output).toContain('Query');
    expect(output).toContain('Numerator');
    expect(output).toContain('Sum Count');
    expect(output).toContain('Denominator');
    expect(output).toContain('Minimum Numerator');
    expect(output).toContain('50');
    expect(output).toContain('Numerator filter');
    expect(output).toContain('statusCode ge 500');
    expect(output).toContain('Denominator filter');
    expect(output).toContain("requestPath eq '/api'");
  });

  it('inspect renders non-custom alert signals and route details', async () => {
    client.scenario.get('/alerts/v3/groups/:groupId', (_req, res) => {
      res.json({
        id: 'ag_error',
        type: 'error_anomaly',
        status: 'active',
        alerts: [
          {
            id: 'al_error',
            startedAt: 1772755200000,
            status: 'active',
            type: 'error_anomaly',
            title: '5xx error spike',
            eventLabel: 'Function Errors',
            measureLabel: 'Error Count',
            unit: 'Errors',
            formattedValues: {
              avgErrorRate: '1%',
              changeAmount: '17x',
              changeDirection: 'increase',
              errorRate: '13%',
              formattedAvg: '104',
              formattedCount: '1.8k',
            },
            data: {
              average: 104,
              cause: 'function',
              count: 1806,
              route: '/api/logs',
              statusGroup: '5xx',
              stddev: 10,
              zscore: 4.5,
            },
          },
        ],
      });
    });

    client.setArgv('alerts', 'inspect', 'ag_error');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('5xx error spike');
    expect(output).toContain('Observed Value');
    expect(output).toContain('1.8k Errors');
    expect(output).toContain('Baseline');
    expect(output).toContain('104 Errors');
    expect(output).toContain('Observed Deviation');
    expect(output).toContain('4.5 z-score');
    expect(output).toContain('Error Rate');
    expect(output).toContain('13%');
    expect(output).toContain('Baseline Error Rate');
    expect(output).toContain('1%');
    expect(output).toContain('Route');
    expect(output).toContain('/api/logs');
    expect(output).toContain('Status Group');
    expect(output).toContain('5xx');
  });
});
