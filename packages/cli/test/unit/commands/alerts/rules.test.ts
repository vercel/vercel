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
  ruleTypes: [
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
  ruleTypes: [
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
  client.scenario.get('/alerts/v3/alert-rules/schema', (req, res) => {
    expect(req.query.teamId).toBe('team_dummy');
    expect(req.query.type).toBe(expectedType);
    res.json(document);
  });
}

describe('alerts rules', () => {
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

  it('auto-paginates v3 rules for the linked project', async () => {
    const cursors: unknown[] = [];
    client.scenario.get('/alerts/v3/alert-rules', (req, res) => {
      cursors.push(req.query.cursor);
      expect(req.query.teamId).toBe('team_dummy');
      expect(req.query.projectId).toBe('prj_alerts');
      expect(req.query.limit).toBe('100');
      expect(req.query.type).toBe('custom');
      if (!req.query.cursor) {
        res.json({
          rules: [customRule],
          pagination: { count: 1, next: 'next' },
        });
      } else {
        res.json({
          rules: [{ ...customRule, id: 'ar_custom_2', name: 'Latency' }],
          pagination: { count: 1, next: null },
        });
      }
    });

    client.setArgv(
      'alerts',
      'rules',
      'ls',
      '--type',
      'custom',
      '--format',
      'json'
    );

    expect(await alerts(client)).toBe(0);
    expect(cursors).toEqual([undefined, 'next']);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.rules.map((rule: { id: string }) => rule.id)).toEqual([
      'ar_custom',
      'ar_custom_2',
    ]);
  });

  it('lists every accessible team rule with --all', async () => {
    client.scenario.get('/alerts/v3/alert-rules', (req, res) => {
      expect(req.query.teamId).toBe('team_dummy');
      expect(req.query.projectId).toBeUndefined();
      res.json({ rules: [builtInRule], pagination: { count: 1, next: null } });
    });

    client.setArgv('alerts', 'rules', '--all');

    expect(await alerts(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('Rule ID');
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
    client.scenario.get('/alerts/v3/alert-rules', (req, res) => {
      expect(req.query.teamId).toBe('team_explicit');
      expect(req.query.projectId).toBeUndefined();
      res.json({ rules: [], pagination: { count: 0, next: null } });
    });
    client.setArgv('--scope', 'explicit-team', 'alerts', 'rules', 'ls');

    expect(await alerts(client)).toBe(0);
  });

  it('accepts custom_alert as a compatibility alias for custom rules', async () => {
    client.scenario.get('/alerts/v3/alert-rules', (req, res) => {
      expect(req.query.type).toBe('custom');
      res.json({ rules: [customRule], pagination: { count: 1, next: null } });
    });
    client.setArgv(
      'alerts',
      'rules',
      'ls',
      '--all',
      '--type',
      'custom_alert',
      '--format',
      'json'
    );

    expect(await alerts(client)).toBe(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.rules.map((rule: { id: string }) => rule.id)).toEqual([
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
    client.scenario.get('/alerts/v3/alert-rules', (req, res) => {
      expect(req.query.type).toBeUndefined();
      res.json({
        rules: [builtInRule, errorRule, buildRule, allBuiltInRule, customRule],
        pagination: { count: 5, next: null },
      });
    });
    client.setArgv(
      'alerts',
      'rules',
      'ls',
      '--all',
      '--type',
      'custom_alert,usage_anomaly',
      '--type',
      'error_anomaly',
      '--format',
      'json'
    );

    expect(await alerts(client)).toBe(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.rules.map((rule: { id: string }) => rule.id)).toEqual([
      'ar_builtin',
      'ar_error',
      'ar_all_built_in',
      'ar_custom',
    ]);
  });

  it('returns the API-owned custom authoring schema unchanged for agents', async () => {
    mockAuthoringSchema(customAuthoringDocument, 'custom');
    client.setArgv(
      'alerts',
      'rules',
      'schema',
      '--type',
      'custom',
      '--format',
      'json'
    );

    expect(await alerts(client)).toBe(0);
    const document = JSON.parse(client.stdout.getFullOutput());
    expect(document).toEqual(customAuthoringDocument);
    expect(JSON.stringify(document)).not.toMatch(/\bv3\b/i);
  });

  it('renders API-owned fields, constraints, and metric discovery', async () => {
    mockAuthoringSchema(customAuthoringDocument, 'custom');
    client.setArgv('alerts', 'rules', 'schema', '--type', 'custom');

    expect(await alerts(client)).toBe(0);
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
    client.setArgv('alerts', 'rules', 'schema', '--type', 'built-in');

    expect(await alerts(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('triggers.items[].filter');
    expect(rendered).toContain('statusGroup:4xx or statusGroup:5xx');
    expect(rendered).toContain('--project <name-or-id>');
    expect(rendered).toContain('--all');
    expect(rendered).toContain('vercel alerts rules add --body ./rule.json');
    expect(rendered).not.toMatch(/\bv3\b/i);
  });

  it('lists rule types returned by the authoring schema endpoint', async () => {
    mockAuthoringSchema({
      schemaVersion: 2,
      ruleTypes: [
        ...builtInAuthoringDocument.ruleTypes,
        ...customAuthoringDocument.ruleTypes,
      ],
    });
    client.setArgv('alerts', 'rules', 'schema');

    expect(await alerts(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('built-in');
    expect(rendered).toContain('custom');
    expect(rendered).toContain('vercel alerts rules schema --type <type>');
  });

  it('shows complete create guidance in help', async () => {
    client.setArgv('alerts', 'rules', 'add', '--help');

    expect(await alerts(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain(
      'Provide ruleScope in the body or use a scope flag, not both.'
    );
    expect(rendered).toContain('Built-in body (rule.json)');
    expect(rendered).toContain('Custom body (rule.json)');
    expect(rendered).toContain('"type": "error_anomaly"');
    expect(rendered).toContain('"metric": "vercel.request.count"');
    expect(rendered).toContain('"filter": "httpStatus >= 500"');
    expect(rendered).toContain('"matchMinimumSeverityLevel": "high"');
    expect(rendered).toContain('vercel metrics schema <metric-or-prefix>');
    expect(rendered).not.toMatch(/\bv3\b/i);
  });

  it('shows partial-body and scope guidance in update help', async () => {
    client.setArgv('alerts', 'rules', 'update', '--help');

    expect(await alerts(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain(
      'type is optional and inferred from the stored rule.'
    );
    expect(rendered).toContain(
      'Use --project or --all to change scope with or without --body.'
    );
    expect(rendered).toContain(
      'vercel alerts rules update ar_abc123 --project my-app'
    );
    expect(rendered).toContain(
      'vercel alerts rules schema --type <built-in|custom>'
    );
    expect(rendered).toContain('"matchMinimumSeverityLevel": "critical"');
    expect(rendered).not.toMatch(/\bv3\b/i);
  });

  it('creates a custom rule and maps --project to v3 ruleScope', async () => {
    mockedGetProject.mockResolvedValue({
      id: 'prj_explicit',
      name: 'explicit-project',
    } as any);
    client.scenario.post('/alerts/v3/alert-rules', (req, res) => {
      expect(req.query).toEqual({ teamId: 'team_dummy' });
      expect(req.body.ruleScope).toEqual({
        type: 'project',
        projectId: 'prj_explicit',
      });
      res.status(201).json({
        rule: {
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
      'alerts',
      'rules',
      'add',
      '--project',
      'explicit-project',
      '--body',
      bodyPath
    );

    expect(await alerts(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('Created');
    expect(rendered).toContain('ar_custom');
    expect(rendered).toContain('project: prj_explicit');
    expect(rendered).toContain(
      'vercel alerts rules inspect ar_custom --scope my-team'
    );
  });

  it('maps --all to a built-in all-project scope', async () => {
    client.scenario.post('/alerts/v3/alert-rules', (req, res) => {
      expect(req.body.ruleScope).toEqual({ type: 'all' });
      res.status(201).json({ rule: builtInRule });
    });
    const bodyPath = writeBody('built-in.json', {
      type: 'built-in',
      name: builtInRule.name,
      triggers: builtInRule.triggers,
      matchMinimumSeverityLevel: builtInRule.matchMinimumSeverityLevel,
    });
    client.setArgv(
      'alerts',
      'rules',
      'add',
      '--all',
      '--body',
      bodyPath,
      '--format',
      'json'
    );

    expect(await alerts(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      rule: builtInRule,
    });
  });

  it('requires an explicit create scope source', async () => {
    const bodyPath = writeBody('unscoped.json', {
      type: 'built-in',
      name: builtInRule.name,
      triggers: builtInRule.triggers,
      matchMinimumSeverityLevel: builtInRule.matchMinimumSeverityLevel,
    });
    client.setArgv('alerts', 'rules', 'add', '--body', bodyPath);

    expect(await alerts(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Missing rule scope');
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
      'alerts',
      'rules',
      'add',
      '--project',
      'my-app',
      '--body',
      bodyPath
    );

    expect(await alerts(client)).toBe(1);
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
    client.setArgv('alerts', 'rules', 'add', '--all', '--body', bodyPath);

    expect(await alerts(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'previous alert-rules shape'
    );
  });

  it('patches metadata without requiring the type discriminator', async () => {
    client.scenario.patch('/alerts/v3/alert-rules/:ruleId', (req, res) => {
      expect(req.params.ruleId).toBe('ar_custom');
      expect(req.query.teamId).toBe('team_dummy');
      expect(req.body).toEqual({ severity: 'medium' });
      res.json({ rule: { ...customRule, severity: 'medium' } });
    });
    const bodyPath = writeBody('patch.json', { severity: 'medium' });
    client.setArgv(
      'alerts',
      'rules',
      'update',
      'ar_custom',
      '--body',
      bodyPath,
      '--format',
      'json'
    );

    expect(await alerts(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput()).rule.severity).toBe(
      'medium'
    );
  });

  it('updates a built-in rule scope with --project', async () => {
    mockedGetProject.mockResolvedValue({
      id: 'prj_explicit',
      name: 'explicit-project',
    } as any);
    client.scenario.get('/alerts/v3/alert-rules/:ruleId', (_req, res) => {
      res.json({ rule: builtInRule });
    });
    client.scenario.patch('/alerts/v3/alert-rules/:ruleId', (req, res) => {
      expect(req.body).toEqual({
        ruleScope: { type: 'include', projectIds: ['prj_explicit'] },
      });
      res.json({
        rule: {
          ...builtInRule,
          ruleScope: { type: 'include', projectIds: ['prj_explicit'] },
        },
      });
    });
    client.setArgv(
      '--scope',
      'my-team',
      'alerts',
      'rules',
      'update',
      'ar_builtin',
      '--project',
      'explicit-project'
    );

    expect(await alerts(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('Updated');
    expect(rendered).toContain(
      'vercel alerts rules inspect ar_builtin --scope my-team'
    );
  });

  it('reports an explicit no-op for an unchanged scope-only update', async () => {
    client.scenario.get('/alerts/v3/alert-rules/:ruleId', (_req, res) => {
      res.json({ rule: builtInRule });
    });
    client.setArgv(
      'alerts',
      'rules',
      'update',
      'ar_builtin',
      '--all',
      '--format',
      'json'
    );

    expect(await alerts(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      rule: builtInRule,
    });
  });

  it('shows unsupported custom queries as a readable success state', async () => {
    client.scenario.get('/alerts/v3/alert-rules/:ruleId', (_req, res) => {
      res.json({
        rule: {
          ...customRule,
          evaluation: null,
          querySupported: false,
        },
      });
    });
    client.setArgv('alerts', 'rules', 'inspect', 'ar_custom');

    expect(await alerts(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('Query unavailable via API');
    expect(rendered).toContain('update metadata');
  });

  it('shows built-in conditions when inspecting a rule', async () => {
    client.scenario.get('/alerts/v3/alert-rules/:ruleId', (_req, res) => {
      res.json({ rule: builtInRule });
    });
    client.setArgv('alerts', 'rules', 'inspect', 'ar_builtin');

    expect(await alerts(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('Built-in conditions');
    expect(rendered).toContain('Minimum severity');
    expect(rendered).toContain('high');
    expect(rendered.indexOf('Minimum severity')).toBeLessThan(
      rendered.indexOf('Trigger')
    );
  });

  it('accepts deprecated --project while inspecting a rule', async () => {
    client.scenario.get('/alerts/v3/alert-rules/:ruleId', (req, res) => {
      expect(req.query.teamId).toBe('team_dummy');
      res.json({ rule: builtInRule });
    });
    client.setArgv(
      'alerts',
      'rules',
      'inspect',
      'ar_builtin',
      '--project',
      'legacy-project',
      '--format',
      'json'
    );

    expect(await alerts(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      rule: builtInRule,
    });
  });

  it('accepts deprecated --all while deleting with --yes', async () => {
    client.scenario.delete('/alerts/v3/alert-rules/:ruleId', (req, res) => {
      expect(req.params.ruleId).toBe('ar_builtin');
      expect(req.query.teamId).toBe('team_dummy');
      res.json({ success: true });
    });
    client.setArgv(
      'alerts',
      'rules',
      'rm',
      'ar_builtin',
      '--all',
      '--yes',
      '--format',
      'json'
    );

    expect(await alerts(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      ok: true,
      ruleId: 'ar_builtin',
      deleted: true,
    });
  });

  it('prints a deletion receipt when --yes skips the preview', async () => {
    client.scenario.delete('/alerts/v3/alert-rules/:ruleId', (_req, res) => {
      res.json({ success: true });
    });
    client.setArgv('alerts', 'rules', 'rm', 'ar_builtin', '--yes');

    expect(await alerts(client)).toBe(0);
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('✓ Deleted');
    expect(rendered).toContain('ar_builtin');
  });

  it('previews the target before interactive deletion', async () => {
    client.input.confirm = vi.fn().mockResolvedValue(true);
    client.scenario.get('/alerts/v3/alert-rules/:ruleId', (_req, res) => {
      res.json({ rule: builtInRule });
    });
    client.scenario.delete('/alerts/v3/alert-rules/:ruleId', (_req, res) => {
      res.json({ success: true });
    });
    client.setArgv('alerts', 'rules', 'rm', 'ar_builtin');

    expect(await alerts(client)).toBe(0);
    expect(client.input.confirm).toHaveBeenCalledWith(
      'Delete alert rule Production anomalies (ar_builtin)? This cannot be undone.',
      false
    );
    const rendered = stripAnsi(client.stderr.getFullOutput());
    expect(rendered).toContain('Production anomalies');
    expect(rendered).toContain('Deleted');
    expect(rendered).not.toContain('alerts rules inspect');
  });

  it('preserves structured API validation issues in JSON errors', async () => {
    client.scenario.post('/alerts/v3/alert-rules', (_req, res) => {
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
    client.setArgv(
      'alerts',
      'rules',
      'add',
      '--body',
      bodyPath,
      '--format',
      'json'
    );

    expect(await alerts(client)).toBe(1);
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
