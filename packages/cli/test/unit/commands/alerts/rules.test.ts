import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'fs';
import { join } from 'path';
import stripAnsi from 'strip-ansi';
import { client } from '../../../mocks/client';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import alerts from '../../../../src/commands/alerts';
import * as linkModule from '../../../../src/util/projects/link';
import * as getScopeModule from '../../../../src/util/get-scope';
import * as getProjectModule from '../../../../src/util/projects/get-project-by-id-or-name';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');
vi.mock('../../../../src/util/projects/get-project-by-id-or-name');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedGetScope = vi.mocked(getScopeModule.default);
const mockedGetProject = vi.mocked(getProjectModule.default);

let tmpDir: string;

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

describe('alerts rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    tmpDir = setupTmpDir('vercel-alerts-rules');
    client.cwd = tmpDir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    client.nonInteractive = false;
  });

  it('lists alert rules for linked project', async () => {
    let path = '';
    client.scenario.get('/alerts/v2/alert-rules', (req, res) => {
      path = req.path;
      expect(req.query.teamId).toBe('team_dummy');
      expect(req.query.projectId).toBe('prj_alerts');
      res.json([
        {
          id: 'ar_1',
          name: 'My rule',
          teamId: 'team_dummy',
          projectId: 'prj_alerts',
        },
      ]);
    });

    client.setArgv('alerts', 'rules', 'ls');

    const exitCode = await alerts(client);
    expect(exitCode).toBe(0);
    expect(path).toContain('/alerts/v2/alert-rules');
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Name');
    expect(output).toContain('Rule id');
    expect(output).toContain('Scope');
    expect(output).toContain('ar_1');
    expect(output).toContain('My rule');
  });

  it('prints add help with built-in and custom body examples', async () => {
    client.setArgv('alerts', 'rules', 'add', '-help');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toContain('vercel alerts rules add [options]');
    expect(output).toContain('Body examples:');
    expect(output).toContain('Built-in usage anomaly rule:');
    expect(output).toContain('Built-in 4xx error anomaly rule:');
    expect(output).toContain('Custom threshold rule:');
    expect(output).toContain('Custom anomaly rule:');
    expect(output).toContain('"alertTypes": [{ "type": "custom_alert" }]');
    expect(output).toContain('queryJsonString');
    expect(output).toContain('Custom alert metric discovery:');
    expect(output).toContain('vercel metrics schema');
    expect(output).toContain('vercel.request.count');
    expect(output).toContain('event: "incomingRequest"');
    expect(output).toContain('vercel.function_invocation.count');
    expect(output).toContain('event: "serverlessFunctionInvocation"');
    expect(output).toContain('vercel alerts rules schema --type <type>');
    expect(output).toContain('built-in rules otherwise remain team-wide');
  });

  it('prints alert rule schema type choices', async () => {
    client.setArgv('alerts', 'rules', 'schema');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toContain('Alert rule schema');
    expect(output).toContain('Type');
    expect(output).toContain('Description');
    expect(output).toContain('usage_anomaly');
    expect(output).toContain('Built-in usage anomaly alerts');
    expect(output).toContain('vercel alerts rules schema --type <type>');
  });

  it('prints reference-first schema for error anomaly rules', async () => {
    client.setArgv('alerts', 'rules', 'schema', '--type', 'error_anomaly');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toContain('Alert rule schema: error_anomaly');
    expect(output).toContain('Fields');
    expect(output).toContain('alertTypes[].type');
    expect(output).toContain('alertTypes[].filter values');
    expect(output).toContain('statusGroup');
    expect(output).toContain('route eq');
    expect(output).toContain('"projectId": "projectId eq \'prj_123\'"');
    expect(output).toContain('Filtered to 5xx on one route');
    expect(output).toContain(
      '"filter": "statusGroup eq \'5xx\' and route eq \'/api/checkout\'"'
    );
  });

  it('prints reference-first schema for custom alert rules', async () => {
    client.setArgv('alerts', 'rules', 'schema', '--type', 'custom_alert');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toContain('Alert rule schema: custom_alert');
    expect(output).toContain('Custom alert fields');
    expect(output).toContain('customAlert.queryJsonString fields');
    expect(output).toContain(
      'Alert query event name, for example incomingRequest'
    );
    expect(output).toContain('scope');
    expect(output).toContain('Project scope');
    expect(output).toContain('customAlert.queryJsonString before escaping');
    expect(output).toContain('Custom alert metric discovery');
    expect(output).toContain('vercel metrics schema <metric-or-prefix>');
    expect(output).toContain('vercel.function_invocation.count');
    expect(output).toContain('event: "serverlessFunctionInvocation"');
    expect(output).toContain('vercel.external_api_request.count');
    expect(output).toContain('event: "outgoingRequest"');
    expect(output).toContain('vercel.sandbox.cpu_total_time_ms');
    expect(output).toContain('event: "sandboxUsage"');
  });

  it('prints alert rule schema as JSON', async () => {
    client.setArgv(
      'alerts',
      'rules',
      'schema',
      '--type',
      'usage_anomaly',
      '--format',
      'json'
    );

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.schema.type).toBe('usage_anomaly');
    expect(payload.schema.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name', required: 'yes' }),
        expect.objectContaining({ field: 'projectId', required: 'no' }),
        expect.objectContaining({
          field: 'alertTypes[].type',
          required: 'yes',
        }),
        expect.objectContaining({
          field: 'alertTypes[].filter',
          required: 'no',
        }),
      ])
    );
    expect(payload.schema.alertTypeFilterValues).toEqual([
      [
        'metric',
        'fluid_cpu_duration, fluid_duration, fast_data_transfer, edge_requests, function_invocations',
      ],
    ]);
  });

  it('summarizes custom alert rule details when present', async () => {
    const queryJsonString = JSON.stringify({
      event: 'incomingRequest',
      rollups: {
        requests: {
          measure: 'count',
          aggregation: 'sum',
        },
      },
      groupBy: ['route'],
      granularity: { minutes: 5 },
    });

    client.scenario.get('/alerts/v2/alert-rules', (_req, res) => {
      res.json([
        {
          id: 'ar_custom',
          name: 'Checkout request volume',
          teamId: 'team_dummy',
          projectId: 'prj_alerts',
          alertTypes: [{ type: 'custom_alert' }],
          customAlert: {
            queryJsonString,
            triggerType: 'threshold',
            triggerOperator: 'gt',
            triggerThreshold: 120,
          },
        },
      ]);
    });

    client.setArgv('alerts', 'rules', 'ls');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Details');
    expect(output).toContain('ar_custom');
    expect(output).toContain('Checkout request volume');
    expect(output).toContain('incoming request sum count by route');
    expect(output).toContain('threshold > 120');
    expect(output).toContain('every 5m');
  });

  it('keeps long rule table values compact', async () => {
    client.scenario.get('/alerts/v2/alert-rules', (_req, res) => {
      res.json([
        {
          id: 'ar_019ad9b5-ca3a-7249-8597-85abe7590577',
          name: 'Very long custom alert rule name that would otherwise stretch the table',
          teamId: 'team_dummy',
          projectId:
            "projectId eq 'Qmc52npNy86S8VV4Mt8a8dP1LEkRNbgosW3pBCQytkcgf2'",
        },
      ]);
    });

    client.setArgv('alerts', 'rules', 'ls');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Very long custom alert rule name that wou...');
    expect(output).toContain("projectId e...CQytkcgf2'");
  });

  it('filters listed rules by alert type', async () => {
    client.scenario.get('/alerts/v2/alert-rules', (_req, res) => {
      res.json([
        {
          id: 'ar_custom',
          name: 'Custom traffic alert',
          teamId: 'team_dummy',
          alertTypes: [{ type: 'custom_alert' }],
        },
        {
          id: 'ar_usage',
          name: 'Usage alert',
          teamId: 'team_dummy',
          alertTypes: [{ type: 'usage_anomaly' }],
        },
      ]);
    });

    client.setArgv('alerts', 'rules', '--all', '--type', 'custom_alert');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('ar_custom');
    expect(output).toContain('Custom traffic alert');
    expect(output).not.toContain('ar_usage');
    expect(output).not.toContain('Usage alert');
  });

  it('filters JSON rules by alert type', async () => {
    client.scenario.get('/alerts/v2/alert-rules', (_req, res) => {
      res.json([
        {
          id: 'ar_custom',
          name: 'Custom traffic alert',
          teamId: 'team_dummy',
          alertTypes: [{ type: 'custom_alert' }],
        },
        {
          id: 'ar_usage',
          name: 'Usage alert',
          teamId: 'team_dummy',
          alertTypes: [{ type: 'usage_anomaly' }],
        },
      ]);
    });

    client.setArgv(
      'alerts',
      'rules',
      'ls',
      '--type',
      'custom_alert',
      '--format',
      'json'
    );

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.rules).toHaveLength(1);
    expect(payload.rules[0].id).toBe('ar_custom');
  });

  it('inspects a built-in alert rule with human-readable output', async () => {
    let requestPath = '';
    client.scenario.get('/alerts/v2/alert-rules/:ruleId', (req, res) => {
      requestPath = req.path;
      expect(req.query.teamId).toBe('team_dummy');
      res.json({
        autosubscribeOwnersInKnock: true,
        autosubscribeProjectAdminsInKnock: true,
        id: 'ar_builtin',
        name: 'Vercel Site',
        owner: '',
        projectId:
          "projectId eq 'Qmc52npNy86S8VV4Mt8a8dP1LEkRNbgosW3pBCQytkcgf2'",
        sensitivityLevel: 3,
        teamId: 'team_dummy',
        action: 'trigger',
      });
    });

    client.setArgv('alerts', 'rules', 'get', 'ar_builtin');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    expect(requestPath).toContain('/alerts/v2/alert-rules/ar_builtin');
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Alert rule');
    expect(output).toContain('Vercel Site');
    expect(output).toContain('ar_builtin');
    expect(output).toContain(
      "projectId eq 'Qmc52npNy86S8VV4Mt8a8dP1LEkRNbgosW3pBCQytkcgf2'"
    );
    expect(output).toContain('Notifications');
    expect(output).toContain('Auto-subscribe owners');
    expect(output).toContain('yes');
  });

  it('inspects an alert rule when flags precede the rule id', async () => {
    let requestPath = '';
    client.scenario.get('/alerts/v2/alert-rules/:ruleId', (req, res) => {
      requestPath = req.path;
      expect(req.query.teamId).toBe('team_dummy');
      res.json({
        id: 'ar_builtin',
        name: 'Vercel Site',
        teamId: 'team_dummy',
      });
    });

    client.setArgv('alerts', 'rules', 'get', '--format', 'json', 'ar_builtin');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    expect(requestPath).toContain('/alerts/v2/alert-rules/ar_builtin');
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      rule: {
        id: 'ar_builtin',
        name: 'Vercel Site',
        teamId: 'team_dummy',
      },
    });
  });

  it('uses inspect command in scope retry hints', async () => {
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    }) as () => never);
    mockedGetLinkedProject.mockResolvedValue({
      status: 'not_linked',
      org: null,
      project: null,
    });

    client.setArgv(
      'alerts',
      'rules',
      'inspect',
      'ar_builtin',
      '--non-interactive'
    );

    await expect(alerts(client)).rejects.toThrow('exit:1');

    const payload = JSON.parse(client.stdout.getFullOutput().trim());
    expect(payload.next).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: expect.stringContaining(
            'alerts rules inspect ar_builtin --project <name_or_id>'
          ),
        }),
      ])
    );
  });

  it('inspects a custom alert rule with query details', async () => {
    const queryJsonString = JSON.stringify({
      event: 'incomingRequest',
      rollups: {
        requests: {
          measure: 'count',
          aggregation: 'sum',
        },
      },
      groupBy: ['requestHostname'],
      granularity: { minutes: 5 },
    });

    client.scenario.get('/alerts/v2/alert-rules/:ruleId', (_req, res) => {
      res.json({
        id: 'ar_custom',
        name: 'Checkout request volume',
        teamId: 'team_dummy',
        projectId: 'prj_alerts',
        alertTypes: [
          {
            type: 'custom_alert',
            filter: "projectId eq 'prj_alerts'",
          },
        ],
        action: 'trigger',
        customAlert: {
          id: 'ca_custom',
          ruleId: 'ar_custom',
          title: 'Checkout request volume',
          queryJsonString,
          triggerType: 'threshold',
          triggerOperator: 'gt',
          triggerThreshold: 120,
          minThreshold: 10,
          createdAt: 1772800000000,
        },
      });
    });

    client.setArgv('alerts', 'rules', 'inspect', 'ar_custom');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Checkout request volume');
    expect(output).toContain('project: prj_alerts');
    expect(output).toContain('custom alert');
    expect(output).toContain('Custom Alert');
    expect(output).toContain('incoming request sum count by request hostname');
    expect(output).toContain('threshold > 120');
    expect(output).toContain('Minimum');
    expect(output).toContain('10');
    expect(output).toContain('Granularity');
    expect(output).toContain('5m');
  });

  it('passes --all through when rules defaults to ls', async () => {
    let requestQuery: any;
    client.scenario.get('/alerts/v2/alert-rules', (req, res) => {
      requestQuery = req.query;
      res.json([]);
    });

    client.setArgv('alerts', 'rules', '--all');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    expect(requestQuery.teamId).toBe('team_dummy');
    expect(requestQuery.projectId).toBeUndefined();
  });

  it('passes --all through to explicit rules ls', async () => {
    let requestQuery: any;
    client.scenario.get('/alerts/v2/alert-rules', (req, res) => {
      requestQuery = req.query;
      res.json([]);
    });

    client.setArgv('alerts', 'rules', 'ls', '--all');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    expect(requestQuery.teamId).toBe('team_dummy');
    expect(requestQuery.projectId).toBeUndefined();
  });

  it('passes nested rules args when global flags precede alerts', async () => {
    let requestQuery: any;
    client.scenario.get('/alerts/v2/alert-rules', (req, res) => {
      requestQuery = req.query;
      res.json([]);
    });

    client.setArgv(
      '--debug',
      '--token',
      'test-token',
      'alerts',
      'rules',
      'ls',
      '--all'
    );

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    expect(requestQuery.teamId).toBe('team_dummy');
    expect(requestQuery.projectId).toBeUndefined();
  });

  it('lists team-wide alert rules without a linked project', async () => {
    mockedGetLinkedProject.mockResolvedValue({
      status: 'not_linked',
      org: null,
      project: null,
    });
    client.scenario.get('/alerts/v2/alert-rules', (req, res) => {
      expect(req.query.teamId).toBe('team_dummy');
      expect(req.query.projectId).toBeUndefined();
      res.json([{ id: 'ar_1', name: 'Team rule', teamId: 'team_dummy' }]);
    });

    client.setArgv('alerts', 'rules', '--all', '--format', 'json');

    const exitCode = await alerts(client);
    expect(exitCode).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      rules: [{ id: 'ar_1', name: 'Team rule', teamId: 'team_dummy' }],
    });
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
  });

  it('lists alert rules for an explicit project', async () => {
    mockedGetProject.mockResolvedValue({ id: 'prj_explicit' } as any);
    client.scenario.get('/alerts/v2/alert-rules', (req, res) => {
      expect(req.query.teamId).toBe('team_dummy');
      expect(req.query.projectId).toBe('prj_explicit');
      res.json([]);
    });

    client.setArgv(
      'alerts',
      'rules',
      '--project',
      'explicit-project',
      '--format',
      'json'
    );

    const exitCode = await alerts(client);
    expect(exitCode).toBe(0);
    expect(mockedGetProject).toHaveBeenCalledWith(
      client,
      'explicit-project',
      'team_dummy'
    );
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
  });

  it('creates a rule from the provided JSON body', async () => {
    let method = '';
    client.scenario.post('/alerts/v2/alert-rules', (req, res) => {
      method = req.method;
      expect(req.query.teamId).toBe('team_dummy');
      expect(req.query.projectId).toBe('prj_alerts');
      expect(req.body).toEqual({
        name: 'from-cli',
        alertTypes: [{ type: 'usage_anomaly' }],
        projectId: "projectId eq 'prj_from_body'",
      });
      res.status(201).json({
        id: 'ar_new',
        name: 'from-cli',
        teamId: 'team_dummy',
      });
    });

    writeFileSync(
      join(tmpDir, 'rule.json'),
      JSON.stringify({
        id: 'ar_copied',
        name: 'from-cli',
        teamId: 'team_from_copy',
        alertTypes: [{ type: 'usage_anomaly' }],
        projectId: "projectId eq 'prj_from_body'",
      })
    );
    client.setArgv('alerts', 'rules', 'add', '--body', 'rule.json');

    const exitCode = await alerts(client);
    expect(exitCode).toBe(0);
    expect(method).toBe('POST');
    expect(client.stderr.getFullOutput()).toContain('Created alert rule');
  });

  it('reports invalid custom alert query JSON before creating a rule', async () => {
    writeFileSync(
      join(tmpDir, 'invalid-custom-rule.json'),
      JSON.stringify({
        name: 'custom-rule',
        projectId: 'prj_alerts',
        alertTypes: [{ type: 'custom_alert' }],
        customAlert: {
          queryJsonString: '{"event":',
          triggerType: 'anomaly',
          triggerOperator: 'gt',
          triggerThreshold: 3,
        },
      })
    );
    client.setArgv(
      'alerts',
      'rules',
      'add',
      '--body',
      'invalid-custom-rule.json'
    );

    const exitCode = await alerts(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Invalid JSON in customAlert.queryJsonString.'
    );
  });

  it('preserves formula rollup keys', async () => {
    client.scenario.post('/alerts/v2/alert-rules', (req, res) => {
      const customAlert = req.body.customAlert as {
        formula: unknown;
        queryJsonString: string;
      };
      const query = JSON.parse(customAlert.queryJsonString);
      expect(query.rollups).toEqual({
        errors: { measure: 'count', aggregation: 'sum' },
        requests: { measure: 'count', aggregation: 'sum' },
      });
      expect(customAlert.formula).toEqual({
        operator: 'divide',
        left: 'errors',
        right: 'requests',
      });
      res.status(201).json({ id: 'ar_ratio', name: 'ratio-rule' });
    });

    writeFileSync(
      join(tmpDir, 'ratio-rule.json'),
      JSON.stringify({
        name: 'ratio-rule',
        projectId: 'prj_alerts',
        alertTypes: [{ type: 'custom_alert' }],
        customAlert: {
          queryJsonString: JSON.stringify({
            event: 'incomingRequest',
            rollups: {
              errors: { measure: 'count', aggregation: 'sum' },
              requests: { measure: 'count', aggregation: 'sum' },
            },
          }),
          triggerType: 'threshold',
          triggerOperator: 'gt',
          triggerThreshold: 0.05,
          formula: {
            operator: 'divide',
            left: 'errors',
            right: 'requests',
          },
        },
      })
    );
    client.setArgv('alerts', 'rules', 'add', '--body', 'ratio-rule.json');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
  });

  it('preserves a custom alert rollup and adds dashboard project metadata', async () => {
    const queryJsonString = JSON.stringify({
      event: 'aiGatewayRequest',
      rollups: {
        cost: {
          measure: 'cost',
          aggregation: 'sum',
        },
      },
      granularity: { hours: 1 },
    });

    client.scenario.post('/alerts/v2/alert-rules', (req, res) => {
      expect(req.body).toEqual({
        name: 'custom-rule',
        projectId: 'prj_alerts',
        alertTypes: [{ type: 'custom_alert' }],
        customAlert: {
          queryJsonString: JSON.stringify({
            event: 'aiGatewayRequest',
            rollups: {
              cost: {
                measure: 'cost',
                aggregation: 'sum',
              },
            },
            granularity: { hours: 1 },
            scope: {
              type: 'project',
              ownerId: 'team_dummy',
              projectIds: ['prj_alerts'],
              projectId: 'prj_alerts',
              projectName: 'alerts-project',
            },
          }),
          triggerType: 'anomaly',
          triggerOperator: 'gt',
          triggerThreshold: 3,
        },
      });
      res.status(201).json({
        id: 'ar_custom',
        name: 'custom-rule',
        teamId: 'team_dummy',
      });
    });

    writeFileSync(
      join(tmpDir, 'custom-rule.json'),
      JSON.stringify({
        name: 'custom-rule',
        alertTypes: [{ type: 'custom_alert' }],
        customAlert: {
          queryJsonString,
          triggerType: 'anomaly',
          triggerOperator: 'gt',
          triggerThreshold: 3,
        },
      })
    );
    client.setArgv('alerts', 'rules', 'add', '--body', 'custom-rule.json');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
  });

  it('resolves an explicitly provided custom alert project name', async () => {
    mockedGetProject.mockResolvedValue({
      id: 'prj_explicit',
      name: 'explicit-project',
    } as any);
    client.scenario.post('/alerts/v2/alert-rules', (req, res) => {
      const customAlert = req.body.customAlert as {
        queryJsonString: string;
      };
      expect(JSON.parse(customAlert.queryJsonString).scope).toEqual({
        type: 'project',
        ownerId: 'team_dummy',
        projectIds: ['prj_explicit'],
        projectId: 'prj_explicit',
        projectName: 'explicit-project',
      });
      res.status(201).json({ id: 'ar_custom', name: 'custom-rule' });
    });

    writeFileSync(
      join(tmpDir, 'explicit-custom-rule.json'),
      JSON.stringify({
        name: 'custom-rule',
        projectId: 'prj_explicit',
        alertTypes: [{ type: 'custom_alert' }],
        customAlert: {
          queryJsonString: JSON.stringify({
            event: 'incomingRequest',
            rollups: {
              requests: { measure: 'count', aggregation: 'sum' },
            },
            granularity: { minutes: 5 },
          }),
          triggerType: 'threshold',
          triggerOperator: 'gt',
          triggerThreshold: 100,
        },
      })
    );
    client.setArgv(
      'alerts',
      'rules',
      'add',
      '--body',
      'explicit-custom-rule.json'
    );

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    expect(mockedGetProject).toHaveBeenCalledWith(
      client,
      'prj_explicit',
      'team_dummy'
    );
  });

  it('adds dashboard project metadata to an existing custom alert scope', async () => {
    mockedGetProject.mockResolvedValue({
      id: 'prj_explicit',
      name: 'explicit-project',
    } as any);
    client.scenario.post('/alerts/v2/alert-rules', (req, res) => {
      const customAlert = req.body.customAlert as {
        queryJsonString: string;
      };
      expect(JSON.parse(customAlert.queryJsonString).scope).toEqual({
        type: 'project',
        ownerId: 'team_dummy',
        projectIds: ['prj_explicit'],
        projectId: 'prj_explicit',
        projectName: 'explicit-project',
      });
      res.status(201).json({ id: 'ar_custom', name: 'custom-rule' });
    });

    writeFileSync(
      join(tmpDir, 'scoped-custom-rule.json'),
      JSON.stringify({
        name: 'custom-rule',
        projectId: 'prj_explicit',
        alertTypes: [{ type: 'custom_alert' }],
        customAlert: {
          queryJsonString: JSON.stringify({
            event: 'incomingRequest',
            rollups: {
              requests: { measure: 'count', aggregation: 'sum' },
            },
            granularity: { minutes: 5 },
            scope: {
              type: 'project',
              ownerId: 'team_dummy',
              projectIds: ['prj_explicit'],
            },
          }),
          triggerType: 'threshold',
          triggerOperator: 'gt',
          triggerThreshold: 100,
        },
      })
    );
    client.setArgv(
      'alerts',
      'rules',
      'add',
      '--body',
      'scoped-custom-rule.json'
    );

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
  });

  it('uses an explicit project as the built-in rule target', async () => {
    mockedGetProject.mockResolvedValue({ id: 'prj_explicit' } as any);
    client.scenario.post('/alerts/v2/alert-rules', (req, res) => {
      expect(req.query.teamId).toBe('team_dummy');
      expect(req.query.projectId).toBe('prj_explicit');
      expect(req.body).toEqual({
        name: 'project-rule',
        alertTypes: [{ type: 'error_anomaly' }],
        projectId: "projectId eq 'prj_explicit'",
      });
      res.status(201).json({
        id: 'ar_project',
        name: 'project-rule',
        teamId: 'team_dummy',
      });
    });

    writeFileSync(
      join(tmpDir, 'project-rule.json'),
      JSON.stringify({
        name: 'project-rule',
        alertTypes: [{ type: 'error_anomaly' }],
      })
    );
    client.setArgv(
      'alerts',
      'rules',
      'add',
      '--body',
      'project-rule.json',
      '--project',
      'explicit-project'
    );

    const exitCode = await alerts(client);
    expect(exitCode).toBe(0);
    expect(mockedGetProject).toHaveBeenCalledWith(
      client,
      'explicit-project',
      'team_dummy'
    );
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
  });

  it('keeps a built-in rule team-wide when only a linked project is available', async () => {
    client.scenario.post('/alerts/v2/alert-rules', (req, res) => {
      expect(req.body).toEqual({
        name: 'team-rule',
        alertTypes: [{ type: 'usage_anomaly' }],
      });
      res.status(201).json({
        id: 'ar_team',
        name: 'team-rule',
        teamId: 'team_dummy',
      });
    });

    writeFileSync(
      join(tmpDir, 'team-rule.json'),
      JSON.stringify({
        name: 'team-rule',
        alertTypes: [{ type: 'usage_anomaly' }],
      })
    );
    client.setArgv('alerts', 'rules', 'add', '--body', 'team-rule.json');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
  });

  it('deletes a rule with --yes', async () => {
    let method = '';
    client.scenario.delete('/alerts/v2/alert-rules/:ruleId', (req, res) => {
      method = req.method;
      expect(req.params.ruleId).toBe('ar_x');
      expect(req.query.teamId).toBe('team_dummy');
      res.json({ success: true });
    });

    client.setArgv('alerts', 'rules', 'rm', 'ar_x', '--yes');

    const exitCode = await alerts(client);
    expect(exitCode).toBe(0);
    expect(method).toBe('DELETE');
    expect(client.stderr.getFullOutput()).toContain('Deleted');
  });

  it('patches a rule', async () => {
    let method = '';
    client.scenario.patch('/alerts/v2/alert-rules/:ruleId', (req, res) => {
      method = req.method;
      expect(req.params.ruleId).toBe('ar_x');
      expect(req.body).toEqual({
        name: 'patched',
        projectId: null,
        customAlert: {
          minThreshold: null,
        },
      });
      res.json({ id: 'ar_x', name: 'patched' });
    });

    writeFileSync(
      join(tmpDir, 'patch.json'),
      JSON.stringify({
        name: 'patched',
        projectId: null,
        customAlert: {
          minThreshold: null,
        },
      })
    );
    client.setArgv('alerts', 'rules', 'update', 'ar_x', '--body', 'patch.json');

    const exitCode = await alerts(client);
    expect(exitCode).toBe(0);
    expect(method).toBe('PATCH');
  });

  it('preserves a rollup and inherits project metadata when updating a custom alert query', async () => {
    mockedGetProject.mockResolvedValue({
      id: 'prj_rule',
      name: 'rule-project',
    } as any);
    const queryJsonString = JSON.stringify({
      event: 'aiGatewayRequest',
      rollups: {
        cost: {
          measure: 'cost',
          aggregation: 'sum',
        },
      },
      granularity: { hours: 1 },
    });

    client.scenario.get('/alerts/v2/alert-rules/:ruleId', (req, res) => {
      expect(req.params.ruleId).toBe('ar_custom');
      res.json({
        id: 'ar_custom',
        teamId: 'team_dummy',
        projectId: 'prj_rule',
        alertTypes: [{ type: 'custom_alert' }],
      });
    });
    client.scenario.patch('/alerts/v2/alert-rules/:ruleId', (req, res) => {
      expect(req.body).toEqual({
        customAlert: {
          queryJsonString: JSON.stringify({
            event: 'aiGatewayRequest',
            rollups: {
              cost: {
                measure: 'cost',
                aggregation: 'sum',
              },
            },
            granularity: { hours: 1 },
            scope: {
              type: 'project',
              ownerId: 'team_dummy',
              projectIds: ['prj_rule'],
              projectId: 'prj_rule',
              projectName: 'rule-project',
            },
          }),
        },
      });
      res.json({ id: 'ar_custom', name: 'custom-rule' });
    });

    writeFileSync(
      join(tmpDir, 'custom-patch.json'),
      JSON.stringify({
        customAlert: {
          queryJsonString,
        },
      })
    );
    client.setArgv(
      'alerts',
      'rules',
      'update',
      'ar_custom',
      '--body',
      'custom-patch.json'
    );

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
  });

  it('preserves an explicit custom alert query scope on update', async () => {
    const queryJsonString = JSON.stringify({
      event: 'incomingRequest',
      rollups: {
        requests: {
          measure: 'count',
          aggregation: 'sum',
        },
      },
      granularity: { minutes: 5 },
      scope: {
        type: 'project',
        ownerId: 'team_explicit',
        projectIds: ['prj_explicit'],
      },
    });

    client.scenario.patch('/alerts/v2/alert-rules/:ruleId', (req, res) => {
      expect(req.body).toEqual({
        customAlert: {
          queryJsonString,
        },
      });
      res.json({ id: 'ar_custom', name: 'custom-rule' });
    });

    writeFileSync(
      join(tmpDir, 'explicit-scope-patch.json'),
      JSON.stringify({
        customAlert: {
          queryJsonString,
        },
      })
    );
    client.setArgv(
      'alerts',
      'rules',
      'update',
      'ar_custom',
      '--body',
      'explicit-scope-patch.json'
    );

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
  });

  it('reports invalid custom alert query JSON before updating a rule', async () => {
    writeFileSync(
      join(tmpDir, 'invalid-custom-patch.json'),
      JSON.stringify({
        customAlert: {
          queryJsonString: '{"event":',
        },
      })
    );
    client.setArgv(
      'alerts',
      'rules',
      'update',
      'ar_custom',
      '--body',
      'invalid-custom-patch.json'
    );

    const exitCode = await alerts(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Invalid JSON in customAlert.queryJsonString.'
    );
  });

  describe('--non-interactive', () => {
    it('rm without --yes emits confirmation_required JSON', async () => {
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv(
        'alerts',
        'rules',
        'rm',
        'ar_x',
        '--non-interactive',
        '--cwd=/tmp/a'
      );

      await expect(alerts(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'confirmation_required',
      });
      expect(
        payload.next?.some((n: { command?: string }) =>
          String(n.command).includes('--yes')
        )
      ).toBe(true);
    });
  });
});
