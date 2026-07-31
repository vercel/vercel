import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'fs';
import { join } from 'path';
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
    expect(output).toContain('project: Qmc52npNy86...BCQytkcgf2');
    expect(output).not.toContain("projectId eq '");
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
      'project: Qmc52npNy86S8VV4Mt8a8dP1LEkRNbgosW3pBCQytkcgf2'
    );
    expect(output).toContain('Sensitivity');
    expect(output).toContain('3');
    expect(output).toContain('Notifications');
    expect(output).toContain('Auto-subscribe owners');
    expect(output).toContain('yes');
    expect(output).not.toContain('"autosubscribeOwnersInKnock"');
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

  it('creates a rule with POST', async () => {
    let method = '';
    client.scenario.post('/alerts/v2/alert-rules', (req, res) => {
      method = req.method;
      expect(req.query.teamId).toBe('team_dummy');
      expect(req.query.projectId).toBe('prj_alerts');
      expect(req.body).toMatchObject({
        name: 'from-cli',
        projectId: 'prj_alerts',
      });
      res.status(201).json({
        id: 'ar_new',
        name: 'from-cli',
        teamId: 'team_dummy',
        projectId: 'prj_alerts',
      });
    });

    writeFileSync(
      join(tmpDir, 'rule.json'),
      JSON.stringify({ name: 'from-cli' })
    );
    client.setArgv('alerts', 'rules', 'add', '--body', 'rule.json');

    const exitCode = await alerts(client);
    expect(exitCode).toBe(0);
    expect(method).toBe('POST');
    expect(client.stderr.getFullOutput()).toContain('Created alert rule');
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
      res.json({ id: 'ar_x', name: 'patched' });
    });

    writeFileSync(
      join(tmpDir, 'patch.json'),
      JSON.stringify({ name: 'patched' })
    );
    client.setArgv('alerts', 'rules', 'update', 'ar_x', '--body', 'patch.json');

    const exitCode = await alerts(client);
    expect(exitCode).toBe(0);
    expect(method).toBe('PATCH');
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
