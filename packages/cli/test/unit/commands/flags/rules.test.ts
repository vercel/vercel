import stripAnsi from 'strip-ansi';
import { beforeEach, describe, expect, it } from 'vitest';
import flags from '../../../../src/commands/flags';
import { formatFlagConditionComparatorList } from '../../../../src/util/flags/comparators';
import type { Flag, UpdateFlagRequest } from '../../../../src/util/flags/types';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
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
      expectHelpOutputToListRuleOperators(client.stderr.getFullOutput());
    });
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
    expect(settingsRequests).toEqual(0);
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

  it('updates rule conditions without fetching flag settings', async () => {
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
    expect(settingsRequests).toEqual(0);
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
