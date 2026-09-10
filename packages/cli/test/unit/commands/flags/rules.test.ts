import stripAnsi from 'strip-ansi';
import { beforeEach, describe, expect, it } from 'vitest';
import flags from '../../../../src/commands/flags';
import { formatFlagConditionComparatorList } from '../../../../src/util/flags/comparators';
import { TIMESTAMP_IDENTIFY_HELP } from '../../../../src/util/flags/attribute-types';
import type { Flag, UpdateFlagRequest } from '../../../../src/util/flags/types';
import {
  setupTmpDir,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import {
  defaultFlagSettings,
  defaultFlags,
  useFlags,
} from '../../../mocks/flags';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

function expectHelpOutputToListRuleOperators(output: string) {
  expect(stripAnsi(output).replace(/\s+/g, ' ')).toContain(
    `Valid operators: ${formatFlagConditionComparatorList()}`
  );
}

describe('flags rules', () => {
  let testFlags: Flag[];
  let patchBodies: UpdateFlagRequest[];
  let settingsRequests: number;

  beforeEach(() => {
    testFlags = JSON.parse(JSON.stringify(defaultFlags)) as Flag[];
    patchBodies = [];
    settingsRequests = 0;
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
    });
    useFlags(
      testFlags,
      undefined,
      defaultFlagSettings,
      undefined,
      request => {
        patchBodies.push(request);
      },
      () => {
        settingsRequests += 1;
      }
    );
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.cwd = cwd;
    client.stdin.isTTY = false;
  });

  describe('--help', () => {
    it('tracks telemetry for nested help', async () => {
      client.setArgv('flags', 'rules', '--help');

      await expect(flags(client)).resolves.toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:rules',
          value: 'rules',
        },
        {
          key: 'flag:help',
          value: 'flags rules',
        },
      ]);
    });

    it('shows rule operators in add help', async () => {
      client.setArgv('flags', 'rules', 'add', '--help');

      const exitCode = await flags(client);

      expect(exitCode).toEqual(2);
      const helpOutput = stripAnsi(client.stderr.getFullOutput());
      expectHelpOutputToListRuleOperators(helpOutput);
      expect(helpOutput.replace(/\s+/g, ' ')).toContain(
        TIMESTAMP_IDENTIFY_HELP
      );
      expect(helpOutput.replace(/\s+/g, ' ')).toContain(
        'after and before are exclusive; use on-or-after or on-or-before for inclusive boundaries'
      );
    });
  });

  it('lists Timestamp conditions as ISO UTC with temporal operators', async () => {
    const signupAt = Date.parse('2026-08-26T22:00:00.000Z');
    testFlags[0].environments.production.rules = [
      {
        id: 'rule_time',
        conditions: [
          {
            lhs: { type: 'entity', kind: 'user', attribute: 'signupAt' },
            cmp: 'gt',
            rhs: signupAt,
          },
        ],
        outcome: { type: 'variant', variantId: 'on' },
      },
    ];

    client.setArgv(
      'flags',
      'rules',
      'ls',
      'my-feature',
      '--environment',
      'production'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toContain('user.signupAt is after 2026-08-26T22:00:00.000Z');
    expect(output).not.toContain(String(signupAt));
    expect(output).not.toContain('is greater than');
  });

  it('lists rules for an environment as JSON', async () => {
    client.setArgv(
      'flags',
      'rules',
      'ls',
      'my-feature',
      '--environment',
      'production',
      '--json'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed).toMatchObject({
      flag: 'my-feature',
      environment: 'production',
    });
    expect(parsed.rules.map((rule: { id: string }) => rule.id)).toEqual([
      'rule_1',
      'rule_2',
    ]);
  });

  it('lists rules for the project selected by --project', async () => {
    client.cwd = setupTmpDir();
    client.config.currentTeam = 'team_dummy';
    useProject({
      ...defaultProject,
      id: 'explicit-flags-rules',
      name: 'explicit-flags-rules',
      accountId: 'team_dummy',
    });
    client.setArgv(
      'flags',
      'rules',
      'ls',
      'my-feature',
      '--environment',
      'production',
      '--project',
      'explicit-flags-rules',
      '--json'
    );

    await expect(flags(client)).resolves.toEqual(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      flag: 'my-feature',
      environment: 'production',
    });
  });

  it('lists inherited rules for a reused environment as JSON', async () => {
    testFlags[0].environments.production.reuse = {
      active: true,
      environment: 'preview',
    };
    testFlags[0].environments.preview.rules = [
      {
        id: 'rule_preview',
        conditions: [
          {
            lhs: { type: 'entity', kind: 'user', attribute: 'plan' },
            cmp: 'eq',
            rhs: 'enterprise',
          },
        ],
        outcome: { type: 'variant', variantId: 'on' },
      },
    ];

    client.setArgv(
      'flags',
      'rules',
      'ls',
      'my-feature',
      '--environment',
      'production',
      '--json'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed).toMatchObject({
      flag: 'my-feature',
      environment: 'production',
      inheritedFrom: 'preview',
    });
    expect(parsed.rules.map((rule: { id: string }) => rule.id)).toEqual([
      'rule_preview',
    ]);
  });

  it('adds a variant rule at a specific position and PATCHes only that environment', async () => {
    client.setArgv(
      'flags',
      'rules',
      'add',
      'my-feature',
      '--environment',
      'production',
      '--condition',
      'user.plan:eq:enterprise',
      '--variant',
      'on',
      '--position',
      '1',
      '--message',
      'Add enterprise rule'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(testFlags[0].environments.production.rules).toHaveLength(3);
    const [newRule, ...existingRules] =
      testFlags[0].environments.production.rules;
    expect(existingRules.map(rule => rule.id)).toEqual(['rule_1', 'rule_2']);
    expect(newRule).toMatchObject({
      conditions: [
        {
          lhs: { type: 'entity', kind: 'user', attribute: 'plan' },
          cmp: 'eq',
          rhs: 'enterprise',
        },
      ],
      outcome: { type: 'variant', variantId: 'on' },
    });
    expect(newRule.id).toMatch(/^rule_/);

    expect(patchBodies).toHaveLength(1);
    expect(patchBodies[0].message).toEqual('Add enterprise rule');
    expect(Object.keys(patchBodies[0].environments ?? {})).toEqual([
      'production',
    ]);
    expect(patchBodies[0].environments?.production?.rules?.[0]).toMatchObject({
      id: newRule.id,
      outcome: { type: 'variant', variantId: 'on' },
    });
    expect(patchBodies[0].environments?.production).toMatchObject({
      active: true,
      fallthrough: { type: 'variant', variantId: 'off' },
      pausedOutcome: { type: 'variant', variantId: 'off' },
    });
    expect(settingsRequests).toEqual(1);
    expect(stripAnsi(client.stderr.getFullOutput())).not.toContain(
      'This rule update was saved'
    );
  });

  it('writes Timestamp conditions as numeric epoch milliseconds', async () => {
    client.setArgv(
      'flags',
      'rules',
      'add',
      'my-feature',
      '--environment',
      'production',
      '--condition',
      'user.signupAt:after:2026-04-16T09:00:00.000Z',
      '--variant',
      'on'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const rules = testFlags[0].environments.production.rules;
    const newRule = rules[rules.length - 1];
    expect(newRule.conditions[0]).toMatchObject({
      lhs: { type: 'entity', kind: 'user', attribute: 'signupAt' },
      cmp: 'gt',
      rhs: Date.parse('2026-04-16T09:00:00.000Z'),
    });
  });

  it('rejects Timestamp conditions without a time', async () => {
    client.setArgv(
      'flags',
      'rules',
      'add',
      'my-feature',
      '--environment',
      'production',
      '--condition',
      'user.signupAt:after:2026-04-16',
      '--variant',
      'on'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'Use an ISO 8601 date and time (for example 2026-04-16T09:00:00Z) or epoch milliseconds'
    );
    expect(patchBodies).toHaveLength(0);
  });

  it.each([
    '1776297600',
    '2026',
  ])('rejects Timestamp rule condition value %s', async value => {
    client.setArgv(
      'flags',
      'rules',
      'add',
      'my-feature',
      '--environment',
      'production',
      '--condition',
      `user.signupAt:after:${value}`,
      '--variant',
      'on'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'milliseconds, not seconds or years'
    );
    expect(patchBodies).toHaveLength(0);
  });

  it('does not rewrite values of attributes that are not declared in settings', async () => {
    client.setArgv(
      'flags',
      'rules',
      'add',
      'my-feature',
      '--environment',
      'production',
      '--condition',
      'user.appVersion:gt:1.2.3',
      '--variant',
      'on'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const rules = testFlags[0].environments.production.rules;
    const newRule = rules[rules.length - 1];
    expect(newRule.conditions[0]).toMatchObject({
      lhs: { type: 'entity', kind: 'user', attribute: 'appVersion' },
      cmp: 'gt',
      rhs: '1.2.3',
    });
  });

  it.each([
    {
      action: 'adding',
      argv: [
        'add',
        'my-feature',
        '--environment',
        'production',
        '--condition',
        'user.plan:eq:enterprise',
        '--variant',
        'true',
      ],
    },
    {
      action: 'updating',
      argv: [
        'update',
        'my-feature',
        'rule_1',
        '--environment',
        'production',
        '--condition',
        'user.plan:eq:enterprise',
      ],
    },
    {
      action: 'moving',
      argv: [
        'move',
        'my-feature',
        'rule_2',
        '--environment',
        'production',
        '--position',
        '1',
      ],
    },
    {
      action: 'removing',
      argv: ['rm', 'my-feature', 'rule_1', '--environment', 'production'],
    },
  ])('warns after $action a rule while the environment serves a fixed variant', async ({
    argv,
  }) => {
    const offId = 'nqz2Hig2vbWGe7jBjWUs1';
    const onId = 'aBcDeFgHiJkLmNoPqRsTu';
    testFlags[0].variants = [
      { id: offId, value: false, label: 'Off' },
      { id: onId, value: true, label: 'On' },
    ];
    for (const env of Object.values(testFlags[0].environments)) {
      if (env.fallthrough.type === 'variant') {
        env.fallthrough.variantId =
          env.fallthrough.variantId === 'off' ? offId : onId;
      }
      if (env.pausedOutcome) {
        env.pausedOutcome.variantId =
          env.pausedOutcome.variantId === 'off' ? offId : onId;
      }
      for (const rule of env.rules) {
        if (rule.outcome.type === 'variant') {
          rule.outcome.variantId =
            rule.outcome.variantId === 'off' ? offId : onId;
        }
      }
    }
    testFlags[0].environments.production.active = false;
    client.setArgv('flags', 'rules', ...argv);

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(patchBodies).toHaveLength(1);
    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toMatch(
      /^! This rule update was saved, but production is serving Off \(false\)\./m
    );
    expect(output).toContain(
      'Rule changes will not affect flag evaluation until targeting is active again.'
    );
    expect(output).toContain(
      'Enable targeting (keeps the current fallthrough):'
    );
    expect(output).toContain(
      'flags use-targeting my-feature --environment production'
    );
    expect(output).not.toContain('--default-variant');
    expect(output).not.toContain(offId);
    expect(output).not.toContain('WARNING!');
    expect(output).not.toContain('uses targeting again');
  });

  it('preserves a paused environment when adding a rule', async () => {
    testFlags[0].environments.preview.active = false;

    client.setArgv(
      'flags',
      'rules',
      'add',
      'my-feature',
      '--environment',
      'preview',
      '--condition',
      'user.plan:eq:enterprise',
      '--variant',
      'on'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(testFlags[0].environments.preview).toMatchObject({
      active: false,
      fallthrough: { type: 'variant', variantId: 'on' },
      pausedOutcome: { type: 'variant', variantId: 'off' },
    });
    expect(testFlags[0].environments.preview.rules).toHaveLength(1);
    expect(patchBodies[0].environments?.preview).toMatchObject({
      active: false,
      rules: [
        {
          outcome: { type: 'variant', variantId: 'on' },
        },
      ],
    });
    expect(stripAnsi(client.stderr.getFullOutput())).toMatch(
      /^! This rule update was saved, but preview is serving Off \(false\)\./m
    );
  });

  it('adds a rule on top of inherited rules and disables reuse', async () => {
    testFlags[0].environments.production.reuse = {
      active: true,
      environment: 'preview',
    };
    testFlags[0].environments.production.rules = [];
    testFlags[0].environments.preview.rules = [
      {
        id: 'rule_preview',
        conditions: [
          {
            lhs: { type: 'entity', kind: 'user', attribute: 'plan' },
            cmp: 'eq',
            rhs: 'pro',
          },
        ],
        outcome: { type: 'variant', variantId: 'on' },
      },
    ];

    client.setArgv(
      'flags',
      'rules',
      'add',
      'my-feature',
      '--environment',
      'production',
      '--condition',
      'user.plan:eq:enterprise',
      '--variant',
      'off'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(
      testFlags[0].environments.production.rules.map(rule => rule.id)
    ).toEqual(['rule_preview', expect.stringMatching(/^rule_/)]);
    expect(testFlags[0].environments.production.reuse).toEqual({
      active: false,
      environment: 'preview',
    });
    expect(testFlags[0].environments.production.active).toEqual(true);
    expect(stripAnsi(client.stderr.getFullOutput())).not.toContain(
      'This rule update was saved'
    );
  });

  it('adds a segment condition with a split outcome', async () => {
    client.setArgv(
      'flags',
      'rules',
      'add',
      'my-feature',
      '--environment',
      'preview',
      '--condition',
      'segment:eq:seg_beta123',
      '--by',
      'user.userId',
      '--weight',
      'off=50',
      '--weight',
      'on=50'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const newRule = testFlags[0].environments.preview.rules[0];
    expect(newRule.conditions[0]).toMatchObject({
      lhs: { type: 'segment' },
      cmp: 'eq',
      rhs: 'seg_beta123',
    });
    expect(newRule.outcome).toMatchObject({
      type: 'split',
      base: {
        type: 'entity',
        kind: 'user',
        attribute: 'userId',
      },
      defaultVariantId: 'off',
      weights: {
        off: 50,
        on: 50,
      },
    });
    expect(settingsRequests).toEqual(1);
  });

  it('updates rule conditions', async () => {
    client.setArgv(
      'flags',
      'rules',
      'update',
      'my-feature',
      'rule_1',
      '--environment',
      'production',
      '--condition',
      'user.plan:eq:enterprise',
      '--message',
      'Update enterprise rule'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(testFlags[0].environments.production.rules[0].conditions).toEqual([
      {
        lhs: { type: 'entity', kind: 'user', attribute: 'plan' },
        cmp: 'eq',
        rhs: 'enterprise',
      },
    ]);
    expect(patchBodies[0].message).toEqual('Update enterprise rule');
    expect(settingsRequests).toEqual(1);
  });

  it('updates inherited rules and disables reuse for the selected environment', async () => {
    testFlags[0].environments.production.reuse = {
      active: true,
      environment: 'preview',
    };
    testFlags[0].environments.production.rules = [];
    testFlags[0].environments.preview.rules = [
      {
        id: 'rule_preview',
        conditions: [
          {
            lhs: { type: 'entity', kind: 'user', attribute: 'plan' },
            cmp: 'eq',
            rhs: 'pro',
          },
        ],
        outcome: { type: 'variant', variantId: 'on' },
      },
    ];

    client.setArgv(
      'flags',
      'rules',
      'update',
      'my-feature',
      'rule_preview',
      '--environment',
      'production',
      '--variant',
      'off'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(testFlags[0].environments.production).toMatchObject({
      active: true,
      reuse: {
        active: false,
        environment: 'preview',
      },
      rules: [
        {
          id: 'rule_preview',
          outcome: { type: 'variant', variantId: 'off' },
        },
      ],
    });
    expect(testFlags[0].environments.preview.rules[0]).toMatchObject({
      id: 'rule_preview',
      outcome: { type: 'variant', variantId: 'on' },
    });
  });

  it('does not PATCH when update inputs resolve to the current rule', async () => {
    client.setArgv(
      'flags',
      'rules',
      'update',
      'my-feature',
      'rule_1',
      '--environment',
      'production',
      '--condition',
      'user.plan:eq:pro',
      '--variant',
      'on',
      '--message',
      'No resolved rule changes'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(patchBodies).toHaveLength(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'No rule changes were provided'
    );
  });

  it('updates a rule to a rollout outcome while preserving conditions', async () => {
    client.setArgv(
      'flags',
      'rules',
      'update',
      'my-feature',
      'rule_1',
      '--environment',
      'production',
      '--by',
      'user.userId',
      '--stage',
      '10,1h',
      '--message',
      'Roll out pro users'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const updatedRule = testFlags[0].environments.production.rules[0];
    expect(updatedRule.conditions).toEqual([
      {
        lhs: { type: 'entity', kind: 'user', attribute: 'plan' },
        cmp: 'eq',
        rhs: 'pro',
      },
    ]);
    expect(updatedRule.outcome).toMatchObject({
      type: 'rollout',
      base: {
        type: 'entity',
        kind: 'user',
        attribute: 'userId',
      },
      rollFromVariantId: 'off',
      rollToVariantId: 'on',
      defaultVariantId: 'off',
      slots: [{ promille: 10000, durationMs: 3_600_000 }],
    });
    expect(patchBodies[0].message).toEqual('Roll out pro users');
    expect(settingsRequests).toEqual(1);
  });

  it('does not PATCH when only a revision message is provided', async () => {
    client.setArgv(
      'flags',
      'rules',
      'update',
      'my-feature',
      'rule_1',
      '--environment',
      'production',
      '--message',
      'No rule changes'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(patchBodies).toHaveLength(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'No rule changes were provided'
    );
    expect(settingsRequests).toEqual(0);
  });

  it('moves a rule while preserving the other rule payloads', async () => {
    client.setArgv(
      'flags',
      'rules',
      'move',
      'my-feature',
      'rule_2',
      '--environment',
      'production',
      '--position',
      '1',
      '--message',
      'Prioritize allowlist'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(
      testFlags[0].environments.production.rules.map(rule => rule.id)
    ).toEqual(['rule_2', 'rule_1']);
    expect(
      patchBodies[0].environments?.production?.rules?.map(rule => rule.id)
    ).toEqual(['rule_2', 'rule_1']);
    expect(patchBodies[0].message).toEqual('Prioritize allowlist');
  });

  it('does not PATCH when moving a rule to its current position', async () => {
    client.setArgv(
      'flags',
      'rules',
      'move',
      'my-feature',
      'rule_1',
      '--environment',
      'production',
      '--position',
      '1',
      '--message',
      'Move nowhere'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(patchBodies).toHaveLength(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'Rule rule_1 is already at position 1 in production'
    );
  });

  it('removes a rule by ID', async () => {
    client.setArgv(
      'flags',
      'rules',
      'rm',
      'my-feature',
      'rule_1',
      '--environment',
      'production',
      '--message',
      'Remove pro rule'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(
      testFlags[0].environments.production.rules.map(rule => rule.id)
    ).toEqual(['rule_2']);
    expect(
      patchBodies[0].environments?.production?.rules?.map(rule => rule.id)
    ).toEqual(['rule_2']);
    expect(patchBodies[0].message).toEqual('Remove pro rule');
  });
});
