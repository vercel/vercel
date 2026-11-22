import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'fs';
import { join } from 'path';
import stripAnsi from 'strip-ansi';
import { client } from '../../../mocks/client';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import alerts from '../../../../src/commands/alerts';
import monitors from '../../../../src/commands/monitors';
import * as getArgsModule from '../../../../src/util/get-args';
import { printCommandHelp } from '../../../../src/commands/print-command-help';
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

const builtInRule = {
  id: 'ar_builtin',
  type: 'built-in',
  name: 'Production anomalies',
  ruleScope: { type: 'all' },
  triggers: {
    mode: 'selected',
    items: [{ type: 'usage_anomaly', filter: 'metrics:edge_requests' }],
  },
  matchMinimumSeverityLevel: 'high',
  notificationSettings: {
    enableTeamOwnerNotifications: true,
  },
  isDefault: false,
};

const customRule = {
  id: 'ar_custom',
  type: 'custom',
  name: 'Checkout errors',
  ruleScope: { type: 'project', projectId: 'prj_alerts' },
  severity: 'high',
  evaluation: {
    window: '5m',
    query: {
      metrics: {
        errors: {
          metric: 'vercel.request.count',
          aggregation: 'count',
          filter: 'httpStatus >= 500',
        },
      },
      outputs: ['errors'],
    },
  },
  trigger: {
    type: 'threshold',
    output: 'errors',
    operator: 'gt',
    threshold: 20,
  },
  notificationSettings: {
    enableTeamOwnerNotifications: true,
  },
  isDefault: false,
  querySupported: true,
};

const customAuthoringDocument = {
  schemaVersion: 2,
  monitorTypes: [
    {
      type: 'custom',
      description: 'One project-scoped metric evaluation.',
      create: {
        jsonSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              const: 'custom',
              description: 'Create a custom metric alert rule.',
            },
            name: {
              type: 'string',
              description: 'Human-readable alert rule name.',
            },
            ruleScope: {
              type: 'object',
              description: 'Single project affected by this custom rule.',
              properties: {
                type: { type: 'string', const: 'project' },
                projectId: {
                  type: 'string',
                  description: 'ID of the project evaluated by this rule.',
                },
              },
              required: ['type', 'projectId'],
            },
            evaluation: {
              type: 'object',
              description: 'Window and metric query evaluated by this rule.',
              properties: {
                window: {
                  type: 'string',
                  enum: ['5m', '1h', '1d'],
                  description: 'Aggregation granularity and detection cadence.',
                },
                query: {
                  type: 'object',
                  properties: {
                    metrics: {
                      type: 'object',
                      description: 'Map of aliases to metric selections.',
                      additionalProperties: {
                        type: 'object',
                        properties: {
                          metric: {
                            type: 'string',
                            description: 'Metric ID.',
                          },
                          aggregation: {
                            type: 'string',
                            enum: ['count', 'sum', 'p95', 'unique'],
                            description: 'Metric aggregation.',
                          },
                        },
                        required: ['metric', 'aggregation'],
                      },
                    },
                    formulas: {
                      type: 'object',
                      description: 'Optional formula map.',
                      additionalProperties: { type: 'string' },
                    },
                    outputs: {
                      type: 'array',
                      prefixItems: [{ type: 'string' }],
                      minItems: 1,
                      maxItems: 1,
                      items: false,
                      description: 'Exactly one query output.',
                    },
                  },
                  required: ['metrics', 'outputs'],
                },
              },
              required: ['window', 'query'],
            },
            trigger: {
              oneOf: [
                {
                  type: 'object',
                  properties: {
                    type: { type: 'string', const: 'threshold' },
                    output: { type: 'string' },
                    threshold: { type: 'number' },
                  },
                  required: ['type', 'output', 'threshold'],
                },
                {
                  type: 'object',
                  properties: {
                    type: { type: 'string', const: 'anomaly' },
                    output: { type: 'string' },
                    standardDeviations: { type: 'number' },
                  },
                  required: ['type', 'output', 'standardDeviations'],
                },
              ],
              description: 'Condition that triggers the rule.',
            },
          },
          required: ['type', 'name', 'ruleScope', 'evaluation', 'trigger'],
          additionalProperties: false,
        },
        examples: [
          {
            name: 'Create a same-event ratio rule',
            body: {
              type: 'custom',
              name: 'Checkout error rate',
              ruleScope: { type: 'project', projectId: 'prj_123' },
              severity: 'high',
              evaluation: customRule.evaluation,
              trigger: customRule.trigger,
            },
          },
        ],
      },
      update: {
        jsonSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Human-readable alert rule name.',
            },
            trigger: {
              type: 'object',
              description: 'Condition that triggers the rule.',
            },
          },
          additionalProperties: false,
        },
        examples: [
          {
            name: 'Update metadata without repeating the rule type',
            body: { name: 'Critical checkout errors', severity: 'high' },
          },
        ],
      },
      metricDiscovery: {
        command: 'vc metrics schema <metric-or-prefix>',
        description:
          'Discover current metric IDs, aggregations, dimensions, and filter fields.',
      },
      constraints: [
        {
          code: 'metric_selection_policy',
          kind: 'request',
          appliesTo: ['create', 'update'],
          paths: ['evaluation.query.metrics.*.aggregation'],
          description:
            'per and normalize require count or sum and cannot be combined.',
        },
      ],
    },
  ],
};

const builtInAuthoringDocument = {
  schemaVersion: 2,
  monitorTypes: [
    {
      type: 'built-in',
      description: 'Pre-defined Vercel alert detectors.',
      create: {
        jsonSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', const: 'built-in' },
            triggers: {
              oneOf: [
                {
                  type: 'object',
                  properties: { mode: { type: 'string', const: 'all' } },
                  required: ['mode'],
                },
                {
                  type: 'object',
                  properties: {
                    mode: { type: 'string', const: 'selected' },
                    items: {
                      type: 'array',
                      items: {
                        oneOf: [
                          {
                            type: 'object',
                            properties: {
                              type: {
                                type: 'string',
                                const: 'error_anomaly',
                              },
                              filter: {
                                type: 'string',
                                description:
                                  'Must contain statusGroup:4xx or statusGroup:5xx.',
                              },
                            },
                            required: ['type', 'filter'],
                          },
                        ],
                      },
                    },
                  },
                  required: ['mode', 'items'],
                },
              ],
            },
          },
          required: ['type', 'triggers'],
          additionalProperties: false,
        },
        examples: [
          {
            name: 'Create an error anomaly rule for every project',
            body: {
              type: 'built-in',
              name: 'Production server errors',
              ruleScope: { type: 'all' },
              triggers: builtInRule.triggers,
              matchMinimumSeverityLevel: 'high',
            },
          },
        ],
      },
      update: {
        jsonSchema: { type: 'object', properties: {} },
        examples: [
          {
            name: 'Update metadata',
            body: { name: 'Critical production errors' },
          },
        ],
      },
      constraints: [],
    },
  ],
};

function writeBody(name: string, body: unknown): string {
  writeFileSync(join(tmpDir, name), JSON.stringify(body));
  return name;
}

function mockLinkedProject(): void {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: 'prj_alerts',
      name: 'alerts-project',
      accountId: 'team_dummy',
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    org: { id: 'team_dummy', slug: 'my-team', type: 'team' },
  });
}

function mockTeamScope(): void {
  mockedGetScope.mockResolvedValue({
    contextName: 'my-team',
    team: { id: 'team_dummy', slug: 'my-team' },
    user: { id: 'user_dummy' },
    app: null,
  } as any);
}

function mockAuthoringSchema(
  document: unknown,
  expectedType?: 'built-in' | 'custom'
): void {
  client.scenario.get('/alerts/v3/monitors/schema', (req, res) => {
    expect(req.query.teamId).toBe('team_dummy');
    expect(req.query.type).toBe(expectedType);
    res.json(document);
  });
}

describe('monitors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    tmpDir = setupTmpDir('vercel-alerts-rules-v3');
    client.cwd = tmpDir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    client.nonInteractive = false;
  });

  it('prints top-level help', () => {
    expect(printCommandHelp(client, 'monitors', [])).toBe(0);
    const helpOut = stripAnsi(client.stdout.getFullOutput());
    expect(helpOut).toContain('vercel monitors');
    expect(helpOut).toContain('notifications');
  });

  it('prints subcommand help under monitors', () => {
    expect(
      printCommandHelp(client, 'monitors', ['notifications', 'link'])
    ).toBe(0);
    expect(stripAnsi(client.stdout.getFullOutput())).toContain(
      'vercel monitors notifications link'
    );
  });

  it('answers help for the hidden `alerts rules` alias with monitors help', () => {
    expect(printCommandHelp(client, 'alerts', ['rules', 'add'])).toBe(0);
    const addHelp = stripAnsi(client.stdout.getFullOutput());
    expect(addHelp).toContain('vercel monitors add');
    expect(addHelp).not.toContain('alert groups');

    client.reset();
    expect(
      printCommandHelp(client, 'alerts', ['--scope', 'acme', 'rules', 'add'])
    ).toBe(0);
    expect(stripAnsi(client.stdout.getFullOutput())).toContain(
      'vercel monitors add'
    );

    expect(
      printCommandHelp(client, 'alerts', ['rules', 'notifications', 'link'])
    ).toBe(0);
    expect(stripAnsi(client.stdout.getFullOutput())).toContain(
      'vercel monitors notifications link'
    );
  });

  it('auto-paginates v3 monitors for the linked project', async () => {
    const cursors: unknown[] = [];
    client.scenario.get('/alerts/v3/monitors', (req, res) => {
      cursors.push(req.query.cursor);
      expect(req.query.teamId).toBe('team_dummy');
      expect(req.query.projectId).toBe('prj_alerts');
      expect(req.query.limit).toBe('100');
      expect(req.query.type).toBe('custom');
      if (!req.query.cursor) {
        res.json({
          monitors: [customRule],
          pagination: { count: 1, next: 'next' },
        });
      } else {
        res.json({
          monitors: [{ ...customRule, id: 'ar_custom_2', name: 'Latency' }],
          pagination: { count: 1, next: null },
        });
      }
    });

    client.setArgv('monitors', 'ls', '--type', 'custom', '--format', 'json');

    expect(await monitors(client)).toBe(0);
    expect(cursors).toEqual([undefined, 'next']);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.monitors.map((rule: { id: string }) => rule.id)).toEqual([
      'ar_custom',
      'ar_custom_2',
    ]);
  });

  it('lists every accessible team monitor with --all', async () => {
    client.scenario.get('/alerts/v3/monitors', (req, res) => {
      expect(req.query.teamId).toBe('team_dummy');
      expect(req.query.projectId).toBeUndefined();
      res.json({
        monitors: [builtInRule],
        pagination: { count: 1, next: null },
      });
    });

    client.setArgv('monitors', '--all');

    expect(await monitors(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('Monitor ID');
    expect(rendered).toContain('Type');
    expect(rendered).toContain('Condition');
    expect(rendered).toContain('ar_builtin');
    expect(rendered).toContain('minimum high');
  });

  it("does not combine an explicit team with another team's linked project", async () => {
    mockedGetLinkedProject.mockResolvedValue({
      status: 'linked',
      project: {
        id: 'prj_alerts',
        name: 'alerts-project',
        accountId: 'team_linked',
        updatedAt: Date.now(),
        createdAt: Date.now(),
      },
      org: { id: 'team_linked', slug: 'linked-team', type: 'team' },
    });
    mockedGetScope.mockResolvedValue({
      contextName: 'explicit-team',
      team: { id: 'team_explicit', slug: 'explicit-team' },
      user: { id: 'user_dummy' },
      app: null,
      explicitScopeProvided: true,
    } as any);
    client.scenario.get('/alerts/v3/monitors', (req, res) => {
      expect(req.query.teamId).toBe('team_explicit');
      expect(req.query.projectId).toBeUndefined();
      res.json({ monitors: [], pagination: { count: 0, next: null } });
    });
    client.setArgv('--scope', 'explicit-team', 'monitors', 'ls');

    expect(await monitors(client)).toBe(0);
  });

  it('accepts custom_alert as a compatibility alias for custom monitors', async () => {
    client.scenario.get('/alerts/v3/monitors', (req, res) => {
      expect(req.query.type).toBe('custom');
      res.json({
        monitors: [customRule],
        pagination: { count: 1, next: null },
      });
    });
    client.setArgv(
      'monitors',
      'ls',
      '--all',
      '--type',
      'custom_alert',
      '--format',
      'json'
    );

    expect(await monitors(client)).toBe(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.monitors.map((rule: { id: string }) => rule.id)).toEqual([
      'ar_custom',
    ]);
  });

  it('accepts repeatable and comma-separated legacy detector filters', async () => {
    const errorRule = {
      ...builtInRule,
      id: 'ar_error',
      triggers: {
        mode: 'selected',
        items: [{ type: 'error_anomaly', filter: 'statusGroup:5xx' }],
      },
    };
    const buildRule = {
      ...builtInRule,
      id: 'ar_build',
      triggers: {
        mode: 'selected',
        items: [{ type: 'buildTime_anomaly' }],
      },
    };
    const allBuiltInRule = {
      ...builtInRule,
      id: 'ar_all_built_in',
      triggers: { mode: 'all' },
    };
    client.scenario.get('/alerts/v3/monitors', (req, res) => {
      expect(req.query.type).toBeUndefined();
      res.json({
        monitors: [
          builtInRule,
          errorRule,
          buildRule,
          allBuiltInRule,
          customRule,
        ],
        pagination: { count: 5, next: null },
      });
    });
    client.setArgv(
      'monitors',
      'ls',
      '--all',
      '--type',
      'custom_alert,usage_anomaly',
      '--type',
      'error_anomaly',
      '--format',
      'json'
    );

    expect(await monitors(client)).toBe(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.monitors.map((rule: { id: string }) => rule.id)).toEqual([
      'ar_builtin',
      'ar_error',
      'ar_all_built_in',
      'ar_custom',
    ]);
  });

  it('returns the API-owned custom authoring schema unchanged for agents', async () => {
    mockAuthoringSchema(customAuthoringDocument, 'custom');
    client.setArgv(
      'monitors',
      'schema',
      '--type',
      'custom',
      '--format',
      'json'
    );

    expect(await monitors(client)).toBe(0);
    const document = JSON.parse(client.stdout.getFullOutput());
    expect(document).toEqual(customAuthoringDocument);
    expect(JSON.stringify(document)).not.toMatch(/\bv3\b/i);
  });

  it('renders API-owned fields, constraints, and metric discovery', async () => {
    mockAuthoringSchema(customAuthoringDocument, 'custom');
    client.setArgv('monitors', 'schema', '--type', 'custom');

    expect(await monitors(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('evaluation.query.metrics.<key>.aggregation');
    expect(rendered).toContain('count | sum | p95 | unique');
    expect(rendered).toContain('Metric selection policy · create/update');
    expect(rendered).toContain('Paths: evaluation.query.metrics.*.aggregation');
    expect(rendered).toContain('vc metrics schema <metric-or-prefix>');
    expect(rendered).toContain('--project <name-or-id>');
    expect(rendered).not.toMatch(/\bv3\b/i);
  });

  it('shows built-in trigger, scope, and filter guidance', async () => {
    mockAuthoringSchema(builtInAuthoringDocument, 'built-in');
    client.setArgv('monitors', 'schema', '--type', 'built-in');

    expect(await monitors(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('triggers.items[].filter');
    expect(rendered).toContain('statusGroup:4xx or statusGroup:5xx');
    expect(rendered).toContain('--project <name-or-id>');
    expect(rendered).toContain('--all');
    expect(rendered).toContain('vercel monitors add --body ./rule.json');
    expect(rendered).not.toMatch(/\bv3\b/i);
  });

  it('lists monitor types returned by the authoring schema endpoint', async () => {
    mockAuthoringSchema({
      schemaVersion: 2,
      monitorTypes: [
        ...builtInAuthoringDocument.monitorTypes,
        ...customAuthoringDocument.monitorTypes,
      ],
    });
    client.setArgv('monitors', 'schema');

    expect(await monitors(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('built-in');
    expect(rendered).toContain('custom');
    expect(rendered).toContain('vercel monitors schema --type <type>');
  });

  it('shows complete create guidance in help', () => {
    expect(printCommandHelp(client, 'monitors', ['add'])).toBe(0);
    const rendered = stripAnsi(client.stdout.getFullOutput());
    expect(rendered).toContain(
      'Provide ruleScope in the body or use a scope option, not both.'
    );
    expect(rendered).toContain('Built-in body (rule.json)');
    expect(rendered).toContain('"type": "error_anomaly"');
    expect(rendered).toContain('"matchMinimumSeverityLevel": "high"');
    expect(rendered).not.toMatch(/\bv3\b/i);
  });

  it('shows partial-body and scope guidance in update help', () => {
    expect(printCommandHelp(client, 'monitors', ['update'])).toBe(0);
    const rendered = stripAnsi(client.stdout.getFullOutput());
    // Help sections wrap to the terminal width.
    expect(rendered.replace(/\s+/g, ' ')).toContain(
      'type is optional and inferred from the stored monitor.'
    );
    expect(rendered).toContain(
      'Use --project or --all to change scope with or without --body.'
    );
    expect(rendered).toContain(
      'vercel monitors update ar_abc123 --project my-app'
    );
    expect(rendered).toContain('vercel monitors schema --type built-in');
    expect(rendered).toContain('"matchMinimumSeverityLevel": "critical"');
    expect(rendered).not.toMatch(/\bv3\b/i);
  });

  it('creates a custom monitor and maps --project to v3 ruleScope', async () => {
    mockedGetProject.mockResolvedValue({
      id: 'prj_explicit',
      name: 'explicit-project',
    } as any);
    client.scenario.post('/alerts/v3/monitors', (req, res) => {
      expect(req.query).toEqual({ teamId: 'team_dummy' });
      expect(req.body.ruleScope).toEqual({
        type: 'project',
        projectId: 'prj_explicit',
      });
      res.status(201).json({
        monitor: {
          ...customRule,
          ruleScope: { type: 'project', projectId: 'prj_explicit' },
        },
      });
    });
    const bodyPath = writeBody('custom.json', {
      type: 'custom',
      name: customRule.name,
      severity: customRule.severity,
      evaluation: customRule.evaluation,
      trigger: customRule.trigger,
      notificationSettings: customRule.notificationSettings,
    });
    client.setArgv(
      '--scope',
      'my-team',
      'monitors',
      'add',
      '--project',
      'explicit-project',
      '--body',
      bodyPath
    );

    expect(await monitors(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('Created');
    expect(rendered).toContain('ar_custom');
    expect(rendered).toContain('project: prj_explicit');
    expect(rendered).toContain(
      'vercel monitors inspect ar_custom --scope my-team'
    );
  });

  it('maps --all to a built-in all-project scope', async () => {
    client.scenario.post('/alerts/v3/monitors', (req, res) => {
      expect(req.body.ruleScope).toEqual({ type: 'all' });
      res.status(201).json({ monitor: builtInRule });
    });
    const bodyPath = writeBody('built-in.json', {
      type: 'built-in',
      name: builtInRule.name,
      triggers: builtInRule.triggers,
      matchMinimumSeverityLevel: builtInRule.matchMinimumSeverityLevel,
    });
    client.setArgv(
      'monitors',
      'add',
      '--all',
      '--body',
      bodyPath,
      '--format',
      'json'
    );

    expect(await monitors(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      monitor: builtInRule,
    });
  });

  it('requires an explicit create scope source', async () => {
    const bodyPath = writeBody('unscoped.json', {
      type: 'built-in',
      name: builtInRule.name,
      triggers: builtInRule.triggers,
      matchMinimumSeverityLevel: builtInRule.matchMinimumSeverityLevel,
    });
    client.setArgv('monitors', 'add', '--body', bodyPath);

    expect(await monitors(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Missing monitor scope');
  });

  it('rejects conflicting body and flag scopes', async () => {
    const bodyPath = writeBody('scoped.json', {
      type: 'built-in',
      name: builtInRule.name,
      ruleScope: { type: 'all' },
      triggers: builtInRule.triggers,
      matchMinimumSeverityLevel: builtInRule.matchMinimumSeverityLevel,
    });
    client.setArgv(
      'monitors',
      'add',
      '--project',
      'my-app',
      '--body',
      bodyPath
    );

    expect(await monitors(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'either in the body or with --project/--all'
    );
  });

  it('returns a friendly migration error for previous request bodies', async () => {
    const bodyPath = writeBody('legacy.json', {
      name: 'Legacy',
      alertTypes: [{ type: 'custom_alert' }],
      customAlert: { queryJsonString: '{}' },
    });
    client.setArgv('monitors', 'add', '--all', '--body', bodyPath);

    expect(await monitors(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'previous alert-rules shape'
    );
  });

  it('patches metadata without requiring the type discriminator', async () => {
    client.scenario.patch('/alerts/v3/monitors/:ruleId', (req, res) => {
      expect(req.params.ruleId).toBe('ar_custom');
      expect(req.query.teamId).toBe('team_dummy');
      expect(req.body).toEqual({ severity: 'medium' });
      res.json({ monitor: { ...customRule, severity: 'medium' } });
    });
    const bodyPath = writeBody('patch.json', { severity: 'medium' });
    client.setArgv(
      'monitors',
      'update',
      'ar_custom',
      '--body',
      bodyPath,
      '--format',
      'json'
    );

    expect(await monitors(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput()).monitor.severity).toBe(
      'medium'
    );
  });

  it('updates a built-in monitor scope with --project', async () => {
    mockedGetProject.mockResolvedValue({
      id: 'prj_explicit',
      name: 'explicit-project',
    } as any);
    client.scenario.get('/alerts/v3/monitors/:ruleId', (_req, res) => {
      res.json({ monitor: builtInRule });
    });
    client.scenario.patch('/alerts/v3/monitors/:ruleId', (req, res) => {
      expect(req.body).toEqual({
        ruleScope: { type: 'include', projectIds: ['prj_explicit'] },
      });
      res.json({
        monitor: {
          ...builtInRule,
          ruleScope: { type: 'include', projectIds: ['prj_explicit'] },
        },
      });
    });
    client.setArgv(
      '--scope',
      'my-team',
      'monitors',
      'update',
      'ar_builtin',
      '--project',
      'explicit-project'
    );

    expect(await monitors(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('Updated');
    expect(rendered).toContain(
      'vercel monitors inspect ar_builtin --scope my-team'
    );
  });

  it('reports an explicit no-op for an unchanged scope-only update', async () => {
    client.scenario.get('/alerts/v3/monitors/:ruleId', (_req, res) => {
      res.json({ monitor: builtInRule });
    });
    client.setArgv(
      'monitors',
      'update',
      'ar_builtin',
      '--all',
      '--format',
      'json'
    );

    expect(await monitors(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      monitor: builtInRule,
    });
  });

  it('shows unsupported custom queries as a readable success state', async () => {
    client.scenario.get('/alerts/v3/monitors/:ruleId', (_req, res) => {
      res.json({
        monitor: {
          ...customRule,
          evaluation: null,
          querySupported: false,
        },
      });
    });
    client.setArgv('monitors', 'inspect', 'ar_custom');

    expect(await monitors(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('Query unavailable via API');
    expect(rendered).toContain('update metadata');
  });

  it('shows built-in conditions when inspecting a monitor', async () => {
    client.scenario.get('/alerts/v3/monitors/:ruleId', (_req, res) => {
      res.json({ monitor: builtInRule });
    });
    client.setArgv('monitors', 'inspect', 'ar_builtin');

    expect(await monitors(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('Built-in conditions');
    expect(rendered).toContain('Minimum severity');
    expect(rendered).toContain('high');
    expect(rendered.indexOf('Minimum severity')).toBeLessThan(
      rendered.indexOf('Trigger')
    );
  });

  it('accepts deprecated --project while inspecting a monitor', async () => {
    client.scenario.get('/alerts/v3/monitors/:ruleId', (req, res) => {
      expect(req.query.teamId).toBe('team_dummy');
      res.json({ monitor: builtInRule });
    });
    client.setArgv(
      'monitors',
      'inspect',
      'ar_builtin',
      '--project',
      'legacy-project',
      '--format',
      'json'
    );

    expect(await monitors(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      monitor: builtInRule,
    });
  });

  it('accepts deprecated --all while deleting with --yes', async () => {
    client.scenario.delete('/alerts/v3/monitors/:ruleId', (req, res) => {
      expect(req.params.ruleId).toBe('ar_builtin');
      expect(req.query.teamId).toBe('team_dummy');
      res.json({ success: true });
    });
    client.setArgv(
      'monitors',
      'rm',
      'ar_builtin',
      '--all',
      '--yes',
      '--format',
      'json'
    );

    expect(await monitors(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      ok: true,
      monitorId: 'ar_builtin',
      deleted: true,
    });
  });

  describe('subcommand names', () => {
    function useBuiltInCreation(): string {
      client.scenario.post('/alerts/v3/monitors', (_req, res) => {
        res.status(201).json({ monitor: builtInRule });
      });
      return writeBody('built-in.json', {
        type: 'built-in',
        name: builtInRule.name,
        triggers: builtInRule.triggers,
        matchMinimumSeverityLevel: builtInRule.matchMinimumSeverityLevel,
      });
    }

    it('warns when invoked as the deprecated create name', async () => {
      const bodyPath = useBuiltInCreation();
      client.setArgv('monitors', 'create', '--all', '--body', bodyPath);

      expect(await monitors(client)).toBe(0);
      expect(stripAnsi(client.stderr.getFullOutput())).toContain(
        '! `vercel monitors create` is deprecated. Use `vercel monitors add`.'
      );
    });

    it('suggests the canonical command when create is used through the alerts rules alias', async () => {
      client.scenario.post('/alerts/v3/alert-rules', (_req, res) => {
        res.status(201).json({ rule: builtInRule });
      });
      const bodyPath = writeBody('built-in.json', {
        type: 'built-in',
        name: builtInRule.name,
        triggers: builtInRule.triggers,
        matchMinimumSeverityLevel: builtInRule.matchMinimumSeverityLevel,
      });
      client.setArgv('alerts', 'rules', 'create', '--all', '--body', bodyPath);

      expect(await alerts(client)).toBe(0);
      expect(stripAnsi(client.stderr.getFullOutput())).toContain(
        '! `vercel monitors create` is deprecated. Use `vercel monitors add`.'
      );
    });

    it('does not warn when invoked as add', async () => {
      const bodyPath = useBuiltInCreation();
      client.setArgv('monitors', 'add', '--all', '--body', bodyPath);

      expect(await monitors(client)).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
    });

    it.each([
      'remove',
      'rm',
    ])('removes a rule when invoked as %s', async name => {
      client.scenario.delete('/alerts/v3/monitors/:ruleId', (_req, res) => {
        res.json({ success: true });
      });
      client.setArgv('monitors', name, 'ar_builtin', '--yes');

      expect(await monitors(client)).toBe(0);
      const stderr = stripAnsi(client.stderr.getFullOutput());
      expect(stderr).toContain('✓ Removed');
      expect(stderr).not.toContain('is deprecated');
    });

    it('warns when invoked as the deprecated delete name', async () => {
      client.scenario.delete('/alerts/v3/monitors/:ruleId', (_req, res) => {
        res.json({ success: true });
      });
      client.setArgv('monitors', 'delete', 'ar_builtin', '--yes');

      expect(await monitors(client)).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(
        '`vercel monitors delete` is deprecated. Use `vercel monitors remove`.'
      );
    });

    it('finds the subcommand after flags', async () => {
      client.scenario.delete('/alerts/v3/monitors/:ruleId', (_req, res) => {
        res.json({ success: true });
      });
      client.setArgv(
        'monitors',
        '--scope',
        'acme',
        'remove',
        'ar_builtin',
        '--yes'
      );

      expect(await monitors(client)).toBe(0);
      expect(stripAnsi(client.stderr.getFullOutput())).toContain('✓ Removed');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:remove', value: 'remove' },
      ]);
    });

    it('finds the notifications action after flags', async () => {
      client.setArgv('monitors', 'notifications', '--scope', 'acme', 'bogus');

      expect(await monitors(client)).toBe(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:notifications', value: 'unknown' },
      ]);
    });

    it('returns 2 for an unknown flag', async () => {
      client.setArgv('monitors', '--bogus');

      expect(await monitors(client)).toBe(2);
    });

    it('returns 1 for an unexpected error', async () => {
      vi.spyOn(getArgsModule, 'takeCommand').mockImplementationOnce(() => {
        throw new Error('boom');
      });
      client.setArgv('monitors', 'ls');

      expect(await monitors(client)).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('boom');
    });

    it('tracks the alerts rules alias as monitors without raw input', async () => {
      client.setArgv('alerts', 'rules', 'ar_abc123');

      expect(await alerts(client)).toBe(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([]);
    });

    it('tracks the alerts rules alias under the monitors subcommand', async () => {
      client.scenario.get('/alerts/v3/alert-rules', (_req, res) => {
        res.json({ rules: [], pagination: { next: null } });
      });
      client.setArgv('alerts', 'rules', 'list', '--format', 'json');

      expect(await alerts(client)).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:ls', value: 'list' },
      ]);
    });

    function useRuleUpdate(): string {
      client.scenario.patch('/alerts/v3/monitors/:ruleId', (_req, res) => {
        res.json({ monitor: { ...customRule, severity: 'medium' } });
      });
      return writeBody('patch.json', { severity: 'medium' });
    }

    it('warns when invoked as the deprecated patch name', async () => {
      const bodyPath = useRuleUpdate();
      client.setArgv('monitors', 'patch', 'ar_custom', '--body', bodyPath);

      expect(await monitors(client)).toBe(0);
      expect(stripAnsi(client.stderr.getFullOutput())).toContain(
        '! `vercel monitors patch` is deprecated. Use `vercel monitors update`.'
      );
    });

    it('does not warn when invoked as update', async () => {
      const bodyPath = useRuleUpdate();
      client.setArgv('monitors', 'update', 'ar_custom', '--body', bodyPath);

      expect(await monitors(client)).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
    });

    function setNotificationUpdateArgv(name: string) {
      client.scenario.patch(
        '/alerts/v3/monitors/:ruleId/notifications/links',
        (req, res) => {
          res.json({ success: true, notification: req.body });
        }
      );
      client.setArgv(
        'monitors',
        'notifications',
        name,
        'ar_builtin',
        '--slack-channel',
        'C123',
        '--slack-installation-id',
        'icfg_123',
        '--critical-only'
      );
    }

    it('warns when invoked as the deprecated notifications patch name', async () => {
      setNotificationUpdateArgv('patch');

      expect(await monitors(client)).toBe(0);
      expect(stripAnsi(client.stderr.getFullOutput())).toContain(
        '! `vercel monitors notifications patch` is deprecated. Use `vercel monitors notifications update`.'
      );
    });

    it('does not warn when invoked as notifications update', async () => {
      setNotificationUpdateArgv('update');

      expect(await monitors(client)).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
    });
  });

  it('prints a deletion receipt when --yes skips the preview', async () => {
    client.scenario.delete('/alerts/v3/monitors/:ruleId', (_req, res) => {
      res.json({ success: true });
    });
    client.setArgv('monitors', 'rm', 'ar_builtin', '--yes');

    expect(await monitors(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('✓ Removed');
    expect(rendered).toContain('ar_builtin');
  });

  it('previews the target before interactive deletion', async () => {
    client.input.confirm = vi.fn().mockResolvedValue(true);
    client.scenario.get('/alerts/v3/monitors/:ruleId', (_req, res) => {
      res.json({ monitor: builtInRule });
    });
    client.scenario.delete('/alerts/v3/monitors/:ruleId', (_req, res) => {
      res.json({ success: true });
    });
    client.setArgv('monitors', 'rm', 'ar_builtin');

    expect(await monitors(client)).toBe(0);
    expect(client.input.confirm).toHaveBeenCalledWith(
      'Remove monitor Production anomalies (ar_builtin)? This cannot be undone.',
      false
    );
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('Production anomalies');
    expect(rendered).toContain('Removed');
    expect(rendered).not.toContain('alerts rules inspect');
  });

  it('auto-paginates and merges aggregate notification destinations', async () => {
    const cursors: unknown[] = [];
    client.scenario.get('/alerts/v3/monitors/notifications', (req, res) => {
      cursors.push(req.query.cursor);
      expect(req.query.teamId).toBe('team_dummy');
      expect(req.query.limit).toBe('100');
      if (!req.query.cursor) {
        res.json({
          notifications: {
            ar_1: [
              {
                type: 'slack',
                id: 'prj_1',
                name: 'Storefront',
                configId: 'icfg_123',
                channelId: 'C123',
                channelName: 'alerts',
                projectScope: {
                  type: 'project',
                  projectId: 'prj_1',
                  projectName: 'Storefront',
                },
              },
            ],
          },
          pagination: { count: 1, next: 'next-page' },
        });
      } else {
        expect(req.query.cursor).toBe('next-page');
        res.json({
          notifications: {
            ar_2: [
              {
                type: 'slack',
                id: 'prj_2',
                name: 'Dashboard',
                configId: 'icfg_123',
                channelId: 'C123',
                channelName: 'alerts',
                projectScope: {
                  type: 'project',
                  projectId: 'prj_2',
                  projectName: 'Dashboard',
                },
              },
            ],
          },
          pagination: { count: 1, next: null },
        });
      }
    });
    client.setArgv('monitors', 'notifications', '--json');

    expect(await monitors(client)).toBe(0);
    expect(cursors).toEqual([undefined, 'next-page']);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      notifications: {
        ar_1: [
          expect.objectContaining({
            type: 'slack',
            projectScope: expect.objectContaining({ projectId: 'prj_1' }),
          }),
        ],
        ar_2: [
          expect.objectContaining({
            type: 'slack',
            projectScope: expect.objectContaining({ projectId: 'prj_2' }),
          }),
        ],
      },
    });
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:notifications', value: 'ls' },
    ]);
  });

  it('tracks the aggregate notifications action with --format json', async () => {
    client.scenario.get('/alerts/v3/monitors/notifications', (_req, res) => {
      res.json({
        notifications: {},
        pagination: { count: 0, next: null },
      });
    });
    client.setArgv('monitors', 'notifications', '--format', 'json');

    expect(await monitors(client)).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:notifications', value: 'ls' },
    ]);
  });

  it('tracks ls when only flags follow monitors', async () => {
    client.scenario.get('/alerts/v3/monitors', (_req, res) => {
      res.json({ monitors: [], pagination: { next: null } });
    });
    client.setArgv('monitors', '--all');

    expect(await monitors(client)).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:ls', value: 'ls' },
      { key: 'flag:all', value: 'TRUE' },
    ]);
  });

  it('does not record raw input for unknown notification actions', async () => {
    client.setArgv('monitors', 'notifications', 'my-monitor-name');

    expect(await monitors(client)).toBe(2);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:notifications', value: 'unknown' },
    ]);
  });

  it('renders aggregate notification destinations', async () => {
    client.scenario.get('/alerts/v3/monitors/notifications', (_req, res) => {
      res.json({
        notifications: {
          ar_empty: [],
          ar_1: [
            {
              type: 'slack',
              id: 'all',
              name: 'All Projects',
              configId: 'icfg_123',
              channelId: 'C123',
              channelName: 'alerts',
              projectScope: { type: 'all' },
            },
          ],
        },
        pagination: { count: 2, next: null },
      });
    });
    client.setArgv('monitors', 'notifications');

    expect(await monitors(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('Monitor notification destinations');
    expect(rendered).not.toContain('ar_empty');
    expect(rendered).toContain(
      [
        'ar_1',
        '    1. Slack #alerts',
        '       Project scope: all projects',
        '       Channel ID: C123',
        '       Slack installation ID: icfg_123',
      ].join('\n')
    );
    expect(rendered).toContain('#alerts');
    expect(rendered).toContain('all projects');
    expect(rendered).toContain('Channel ID: C123');
    expect(rendered).toContain('Slack installation ID: icfg_123');
    expect(rendered).not.toContain('Identifiers');
  });

  it('renders an empty aggregate destination state', async () => {
    client.scenario.get('/alerts/v3/monitors/notifications', (_req, res) => {
      res.json({
        notifications: { ar_empty: [] },
        pagination: { count: 1, next: null },
      });
    });
    client.setArgv('monitors', 'notifications');

    expect(await monitors(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('No linked notification destinations found.');
    expect(rendered).not.toContain('ar_empty');
  });

  it('writes structured aggregate notifications in non-interactive mode', async () => {
    client.scenario.get('/alerts/v3/monitors/notifications', (_req, res) => {
      res.json({
        notifications: {},
        pagination: { count: 0, next: null },
      });
    });
    client.nonInteractive = true;
    client.setArgv('monitors', 'notifications');

    expect(await monitors(client)).toBe(0);
    expect(client.stderr.getFullOutput()).toBe('');
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      status: 'ok',
      notifications: {},
      message: 'Listed 0 notification destinations across 0 readable monitors.',
      next: [
        {
          command:
            'vercel monitors notifications link <monitor-id> --slack-channel <channel-id> --slack-installation-id <installation-id>',
          when: 'Link a Slack channel to a monitor',
        },
        {
          command:
            'vercel monitors notifications link <monitor-id> --webhook <webhook-id>',
          when: 'Link an account webhook to a monitor',
        },
      ],
    });
  });

  it('lists notification destinations for one monitor with the default action', async () => {
    client.scenario.get(
      '/alerts/v3/monitors/:ruleId/notifications',
      (req, res) => {
        expect(req.params.ruleId).toBe('ar_custom/value');
        expect(req.query.teamId).toBe('team_dummy');
        res.json({
          notifications: [
            {
              type: 'slack',
              id: 'slack_123',
              name: 'Production',
              configId: 'icfg_123',
              channelId: 'C123',
              channelName: 'production-alerts',
              projectScope: { type: 'all' },
              minimumSeverityLevel: 'critical',
            },
            {
              type: 'webhook',
              webhook: { id: 'wh_legacy' },
            },
            {
              type: 'webhook',
              webhook: {
                id: 'wh_123',
                url: 'https://example.com/alerts',
                events: ['alerts.triggered'],
                ownerId: 'team_dummy',
                createdAt: 0,
                updatedAt: 0,
                createdFrom: 'account',
              },
            },
          ],
        });
      }
    );
    client.setArgv('monitors', 'notifications', 'ar_custom/value');

    expect(await monitors(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain(
      [
        '1. Slack #production-alerts',
        '       Project scope: all projects',
        '       Channel ID: C123',
        '       Slack installation ID: icfg_123',
      ].join('\n')
    );
    expect(rendered).toContain('Details unavailable');
    expect(rendered).toContain('https://example.com/alerts');
    expect(rendered).toContain(
      'Minimum severity: Critical only (escalated by Vercel Agent)'
    );
  });

  it('writes the notification list envelope unchanged as JSON', async () => {
    const response = { notifications: [] };
    client.scenario.get(
      '/alerts/v3/monitors/:ruleId/notifications',
      (_req, res) => res.json(response)
    );
    client.setArgv('monitors', 'notifications', 'ls', 'ar_builtin', '--json');

    expect(await monitors(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual(response);
  });

  it('writes a structured notification list in non-interactive mode', async () => {
    const notification = {
      type: 'webhook',
      webhook: { id: 'wh_123' },
    };
    client.scenario.get(
      '/alerts/v3/monitors/:ruleId/notifications',
      (_req, res) => res.json({ notifications: [notification] })
    );
    client.nonInteractive = true;
    client.setArgv('monitors', 'notifications', 'ar_builtin');

    expect(await monitors(client)).toBe(0);
    expect(client.stderr.getFullOutput()).toBe('');
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      status: 'ok',
      monitorId: 'ar_builtin',
      notifications: [notification],
      message: '1 notification destination linked to monitor ar_builtin.',
      next: [
        {
          command:
            'vercel monitors notifications link ar_builtin --webhook <webhook-id>',
          when: 'Link an account webhook',
        },
        {
          command:
            'vercel monitors notifications link ar_builtin --slack-channel <channel-id>',
          when: 'Link a Slack channel',
        },
      ],
    });
  });

  it('links Slack without an installation ID', async () => {
    client.scenario.post(
      '/alerts/v3/monitors/:ruleId/notifications/links',
      (req, res) => {
        expect(req.params.ruleId).toBe('ar_builtin');
        expect(req.query.teamId).toBe('team_dummy');
        expect(req.body).toEqual({ type: 'slack', channelId: 'C123' });
        res.json({ success: true });
      }
    );
    client.setArgv(
      '--scope',
      'my-team',
      'monitors',
      'notifications',
      'link',
      'ar_builtin',
      '--slack-channel',
      'C123'
    );

    expect(await monitors(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('✓ Linked');
    expect(rendered).toContain('Slack channel C123');
    expect(rendered).toContain(
      'vercel monitors notifications ar_builtin --scope my-team'
    );
  });

  it('unlinks Slack with an explicit installation ID', async () => {
    client.scenario.delete(
      '/alerts/v3/monitors/:ruleId/notifications/links',
      (req, res) => {
        expect(req.params.ruleId).toBe('ar_builtin');
        expect(req.body).toEqual({
          type: 'slack',
          channelId: 'C123',
          configId: 'icfg_123',
        });
        res.json({ success: true });
      }
    );
    client.setArgv(
      'monitors',
      'notifications',
      'unlink',
      'ar_builtin',
      '--slack-channel',
      'C123',
      '--slack-installation-id',
      'icfg_123',
      '--format',
      'json'
    );

    expect(await monitors(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      success: true,
    });
  });

  it('links a webhook and preserves the JSON success envelope', async () => {
    client.scenario.post(
      '/alerts/v3/monitors/:ruleId/notifications/links',
      (req, res) => {
        expect(req.body).toEqual({ type: 'webhook', webhookId: 'wh_123' });
        res.json({ success: true });
      }
    );
    client.setArgv(
      'monitors',
      'notifications',
      'link',
      'ar_builtin',
      '--webhook',
      'wh_123',
      '--json'
    );

    expect(await monitors(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      success: true,
    });
  });

  it('links a Critical-only webhook', async () => {
    client.scenario.post(
      '/alerts/v3/monitors/:ruleId/notifications/links',
      (req, res) => {
        expect(req.body).toEqual({
          type: 'webhook',
          webhookId: 'wh_123',
          minimumSeverityLevel: 'critical',
        });
        res.json({ success: true });
      }
    );
    client.setArgv(
      'monitors',
      'notifications',
      'link',
      'ar_builtin',
      '--webhook',
      'wh_123',
      '--critical-only'
    );

    expect(await monitors(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('✓ Linked');
    expect(rendered).toContain('webhook wh_123');
    expect(rendered).toContain('Critical only (escalated by Vercel Agent)');
  });

  it('updates a destination to Critical-only delivery', async () => {
    client.scenario.patch(
      '/alerts/v3/monitors/:ruleId/notifications/links',
      (req, res) => {
        expect(req.params.ruleId).toBe('ar_builtin');
        expect(req.body).toEqual({
          type: 'slack',
          channelId: 'C123',
          configId: 'icfg_123',
          minimumSeverityLevel: 'critical',
        });
        res.json({
          success: true,
          notification: req.body,
        });
      }
    );
    client.setArgv(
      'monitors',
      'notifications',
      'update',
      'ar_builtin',
      '--slack-channel',
      'C123',
      '--slack-installation-id',
      'icfg_123',
      '--critical-only',
      '--json'
    );

    expect(await monitors(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      success: true,
      notification: {
        type: 'slack',
        channelId: 'C123',
        configId: 'icfg_123',
        minimumSeverityLevel: 'critical',
      },
    });
  });

  it('clears Critical-only delivery and reports the resolved destination in non-interactive mode', async () => {
    client.scenario.patch(
      '/alerts/v3/monitors/:ruleId/notifications/links',
      (req, res) => {
        expect(req.body).toEqual({
          type: 'slack',
          channelId: 'C123',
          minimumSeverityLevel: null,
        });
        res.json({
          success: true,
          notification: {
            type: 'slack',
            channelId: 'C123',
            configId: 'icfg_123',
          },
        });
      }
    );
    client.nonInteractive = true;
    client.setArgv(
      'monitors',
      'notifications',
      'update',
      'ar_builtin',
      '--slack-channel',
      'C123',
      '--no-critical-only'
    );

    expect(await monitors(client)).toBe(0);
    expect(client.stderr.getFullOutput()).toBe('');
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      status: 'ok',
      success: true,
      action: 'update',
      monitorId: 'ar_builtin',
      notification: {
        type: 'slack',
        channelId: 'C123',
        configId: 'icfg_123',
      },
      message: 'Updated notification destination for monitor ar_builtin.',
      next: [
        {
          command: 'vercel monitors notifications ar_builtin',
          when: 'Inspect linked notification destinations',
        },
      ],
    });
  });

  it('requires one delivery setting when updating a destination', async () => {
    client.setArgv(
      'monitors',
      'notifications',
      'update',
      'ar_builtin',
      '--webhook',
      'wh_123'
    );

    expect(await monitors(client)).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Specify --critical-only or --no-critical-only.'
    );
  });

  it('rejects conflicting Critical-only flags', async () => {
    client.setArgv(
      'monitors',
      'notifications',
      'update',
      'ar_builtin',
      '--webhook',
      'wh_123',
      '--critical-only',
      '--no-critical-only'
    );

    expect(await monitors(client)).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Specify either --critical-only or --no-critical-only, not both.'
    );
  });

  it('writes a structured link result in non-interactive mode', async () => {
    client.scenario.post(
      '/alerts/v3/monitors/:ruleId/notifications/links',
      (req, res) => {
        expect(req.body).toEqual({ type: 'webhook', webhookId: 'wh_123' });
        res.json({
          success: true,
          notification: { type: 'webhook', webhookId: 'wh_123' },
        });
      }
    );
    client.nonInteractive = true;
    client.setArgv(
      'monitors',
      'notifications',
      'link',
      'ar_builtin',
      '--webhook',
      'wh_123'
    );

    expect(await monitors(client)).toBe(0);
    expect(client.stderr.getFullOutput()).toBe('');
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      status: 'ok',
      success: true,
      action: 'link',
      monitorId: 'ar_builtin',
      notification: { type: 'webhook', webhookId: 'wh_123' },
      message: 'Linked notification destination to monitor ar_builtin.',
      next: [
        {
          command: 'vercel monitors notifications ar_builtin',
          when: 'Inspect linked notification destinations',
        },
      ],
    });
  });

  it('writes a structured unlink result in non-interactive mode', async () => {
    client.scenario.delete(
      '/alerts/v3/monitors/:ruleId/notifications/links',
      (req, res) => {
        expect(req.body).toEqual({ type: 'slack', channelId: 'C123' });
        res.json({
          success: true,
          notification: {
            type: 'slack',
            channelId: 'C123',
            configId: 'icfg_123',
          },
        });
      }
    );
    client.nonInteractive = true;
    client.setArgv(
      'monitors',
      'notifications',
      'unlink',
      'ar_builtin',
      '--slack-channel',
      'C123'
    );

    expect(await monitors(client)).toBe(0);
    expect(client.stderr.getFullOutput()).toBe('');
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      status: 'ok',
      success: true,
      action: 'unlink',
      monitorId: 'ar_builtin',
      notification: {
        type: 'slack',
        channelId: 'C123',
        configId: 'icfg_123',
      },
      message: 'Unlinked notification destination from monitor ar_builtin.',
      next: [
        {
          command: 'vercel monitors notifications ar_builtin',
          when: 'Inspect linked notification destinations',
        },
      ],
    });
  });

  it('validates notification target flags before requesting the API', async () => {
    client.setArgv(
      'monitors',
      'notifications',
      'link',
      'ar_builtin',
      '--webhook',
      'wh_123',
      '--slack-channel',
      'C123'
    );

    expect(await monitors(client)).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Specify either --webhook or --slack-channel, not both.'
    );
  });

  it('surfaces Slack installation ambiguity from the API', async () => {
    client.scenario.post(
      '/alerts/v3/monitors/:ruleId/notifications/links',
      (_req, res) => {
        res.status(400).json({
          error: {
            code: 'bad_request',
            message:
              'configId is required unless the team has exactly one Slack configuration.',
          },
        });
      }
    );
    client.setArgv(
      'monitors',
      'notifications',
      'link',
      'ar_builtin',
      '--slack-channel',
      'C123'
    );

    expect(await monitors(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'A Slack installation ID is required unless the team has exactly one completed Slack installation.'
    );
  });

  it('shows notification command help with optional Slack installation guidance', () => {
    expect(
      printCommandHelp(client, 'monitors', ['notifications', 'link'])
    ).toBe(0);
    const rendered = stripAnsi(client.stdout.getFullOutput());
    expect(rendered).toContain('monitors notifications link <monitorId>');
    expect(rendered.replace(/\s+/g, ' ')).toContain(
      '--slack-installation-id <INSTALLATION_ID> Slack installation ID. Optional only when the team has exactly one completed Slack installation.'
    );
    expect(rendered.replace(/\s+/g, ' ')).toContain(
      '--critical-only Notify only when Vercel Agent escalates an alert to Critical'
    );
  });

  it('shows Critical-only update guidance', () => {
    expect(
      printCommandHelp(client, 'monitors', ['notifications', 'update'])
    ).toBe(0);
    const rendered = stripAnsi(client.stdout.getFullOutput()).replace(
      /\s+/g,
      ' '
    );
    expect(rendered).toContain('monitors notifications update <monitorId>');
    expect(rendered).toContain(
      '--critical-only Notify only when Vercel Agent escalates an alert to Critical'
    );
    expect(rendered).toContain(
      '--no-critical-only Deliver every alert matched by the monitor'
    );
  });

  it('shows an optional monitor ID for notification lists', () => {
    expect(printCommandHelp(client, 'monitors', ['notifications', 'ls'])).toBe(
      0
    );
    expect(stripAnsi(client.stdout.getFullOutput())).toContain(
      'monitors notifications ls [monitorId] [options]'
    );
  });

  it('preserves structured API validation issues in JSON errors', async () => {
    client.scenario.post('/alerts/v3/monitors', (_req, res) => {
      res.status(400).json({
        error: {
          code: 'bad_request',
          message: 'Invalid custom alert rule query.',
          issues: [
            {
              path: 'evaluation.query.outputs.0',
              message: 'Output must reference a metric or formula.',
            },
          ],
        },
      });
    });
    const bodyPath = writeBody('invalid-query.json', {
      type: 'custom',
      name: customRule.name,
      ruleScope: customRule.ruleScope,
      severity: customRule.severity,
      evaluation: customRule.evaluation,
      trigger: customRule.trigger,
    });
    client.setArgv('monitors', 'add', '--body', bodyPath, '--format', 'json');

    expect(await monitors(client)).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      error: {
        code: 'bad_request',
        message: 'Invalid custom alert rule query.',
        issues: [
          {
            path: 'evaluation.query.outputs.0',
            message: 'Output must reference a metric or formula.',
          },
        ],
      },
    });
  });
});
