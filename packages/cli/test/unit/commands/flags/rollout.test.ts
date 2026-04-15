import stripAnsi from 'strip-ansi';
import { beforeEach, describe, expect, it } from 'vitest';
import flags from '../../../../src/commands/flags';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { useFlags } from '../../../mocks/flags';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import type { Flag } from '../../../../src/util/flags/types';

function createTestFlags(): Flag[] {
  return [
    {
      id: 'flag_bool123',
      slug: 'my-feature',
      description: 'My awesome feature flag',
      kind: 'boolean',
      state: 'active',
      variants: [
        { id: 'off', value: false, label: 'Off' },
        { id: 'on', value: true, label: 'On' },
      ],
      environments: {
        production: {
          active: false,
          fallthrough: { type: 'variant', variantId: 'off' },
          pausedOutcome: { type: 'variant', variantId: 'off' },
          rules: [],
        },
        preview: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'off' },
          pausedOutcome: { type: 'variant', variantId: 'off' },
          rules: [],
        },
        development: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'on' },
          pausedOutcome: { type: 'variant', variantId: 'off' },
          rules: [],
        },
      },
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 3600000,
      createdBy: 'user_123',
      projectId: 'vercel-flags-test',
      ownerId: 'team_dummy',
      revision: 1,
      seed: 12345,
      typeName: 'flag',
    },
    {
      id: 'flag_string456',
      slug: 'welcome-message',
      description: 'A string feature flag',
      kind: 'string',
      state: 'active',
      variants: [
        { id: 'control', value: 'control', label: 'Control' },
        { id: 'treatment', value: 'treatment', label: 'Treatment' },
      ],
      environments: {
        production: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'control' },
          pausedOutcome: { type: 'variant', variantId: 'control' },
          rules: [],
        },
        preview: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'control' },
          pausedOutcome: { type: 'variant', variantId: 'control' },
          rules: [],
        },
        development: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'control' },
          pausedOutcome: { type: 'variant', variantId: 'control' },
          rules: [],
        },
      },
      createdAt: Date.now() - 172800000,
      updatedAt: Date.now() - 7200000,
      createdBy: 'user_123',
      projectId: 'vercel-flags-test',
      ownerId: 'team_dummy',
      revision: 2,
      seed: 67890,
      typeName: 'flag',
    },
  ];
}

describe('flags rollout', () => {
  let testFlags: Flag[];

  beforeEach(() => {
    testFlags = createTestFlags();
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
    });
    useFlags(testFlags);
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.cwd = cwd;
    (client.stdin as any).isTTY = false;
  });

  it('tracks rollout usage', async () => {
    client.setArgv(
      'flags',
      'rollout',
      testFlags[0].slug,
      '--environment',
      'production',
      '--by',
      'user.userId',
      '--stage',
      '5,6h'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:rollout',
        value: 'rollout',
      },
      {
        key: 'argument:flag',
        value: '[REDACTED]',
      },
      {
        key: 'option:environment',
        value: 'production',
      },
      {
        key: 'option:by',
        value: '[REDACTED]',
      },
      {
        key: 'option:stage',
        value: '[REDACTED]',
      },
    ]);
  });

  it('configures a boolean staged rollout with inferred variants', async () => {
    client.setArgv(
      'flags',
      'rollout',
      testFlags[0].slug,
      '--environment',
      'production',
      '--by',
      'user.userId',
      '--stage',
      '5,6h',
      '--stage',
      '10,12h'
    );

    const before = Date.now();
    const exitCode = await flags(client);
    const after = Date.now();

    expect(exitCode).toEqual(0);
    expect(testFlags[0].environments.production).toMatchObject({
      active: true,
      pausedOutcome: { type: 'variant', variantId: 'off' },
      fallthrough: {
        type: 'rollout',
        base: {
          type: 'entity',
          kind: 'user',
          attribute: 'userId',
        },
        rollFromVariantId: 'off',
        rollToVariantId: 'on',
        defaultVariantId: 'off',
        slots: [
          { promille: 5000, durationMs: 21_600_000 },
          { promille: 10000, durationMs: 43_200_000 },
        ],
      },
    });
    const rollout = testFlags[0].environments.production.fallthrough;
    expect(rollout.type).toBe('rollout');
    if (rollout.type === 'rollout') {
      expect(rollout.startTimestamp).toBeGreaterThanOrEqual(before);
      expect(rollout.startTimestamp).toBeLessThanOrEqual(after);
    }

    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toContain('rollout has been updated in production');
    expect(output).toContain('Roll from: Off');
    expect(output).toContain('Roll to: On');
    expect(output).toContain('Fallback: Off');
    expect(output).toContain('Start: immediately');
    expect(output).toContain(
      'Stages: 5% for 6 hours, 10% for 12 hours, then 100% indefinitely'
    );
  });

  it('configures a scheduled rollout for non-boolean flags', async () => {
    client.setArgv(
      'flags',
      'rollout',
      testFlags[1].slug,
      '--environment',
      'production',
      '--by',
      'user.userId',
      '--from-variant',
      'control',
      '--to-variant',
      'treatment',
      '--default-variant',
      'control',
      '--stage',
      '10,2h',
      '--stage',
      '50,12h',
      '--start',
      '2026-04-16T09:00:00.000Z'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(testFlags[1].environments.production).toMatchObject({
      active: true,
      pausedOutcome: { type: 'variant', variantId: 'control' },
      fallthrough: {
        type: 'rollout',
        base: {
          type: 'entity',
          kind: 'user',
          attribute: 'userId',
        },
        startTimestamp: new Date('2026-04-16T09:00:00.000Z').getTime(),
        rollFromVariantId: 'control',
        rollToVariantId: 'treatment',
        defaultVariantId: 'control',
        slots: [
          { promille: 10000, durationMs: 7_200_000 },
          { promille: 50000, durationMs: 43_200_000 },
        ],
      },
    });
  });

  it('preserves the current rollout start time when updating an existing rollout', async () => {
    testFlags[0].environments.production.fallthrough = {
      type: 'rollout',
      base: {
        type: 'entity',
        kind: 'user',
        attribute: 'userId',
      },
      startTimestamp: 1_700_000_000_000,
      rollFromVariantId: 'off',
      rollToVariantId: 'on',
      defaultVariantId: 'off',
      slots: [{ promille: 5000, durationMs: 3_600_000 }],
    };
    testFlags[0].environments.production.active = true;

    client.setArgv(
      'flags',
      'rollout',
      testFlags[0].slug,
      '--environment',
      'production',
      '--stage',
      '25,6h'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const rollout = testFlags[0].environments.production.fallthrough;
    expect(rollout.type).toBe('rollout');
    if (rollout.type === 'rollout') {
      expect(rollout.startTimestamp).toBe(1_700_000_000_000);
      expect(rollout.base).toEqual({
        type: 'entity',
        kind: 'user',
        attribute: 'userId',
      });
    }

    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toContain('Based on: user.userId');
  });

  it('preserves custom rules and targets while disabling reuse', async () => {
    testFlags[0].environments.production = {
      active: true,
      reuse: {
        active: true,
        environment: 'preview',
      },
      fallthrough: { type: 'variant', variantId: 'off' },
      pausedOutcome: { type: 'variant', variantId: 'off' },
      rules: [
        {
          id: 'rule_custom',
          conditions: [],
          outcome: { type: 'variant', variantId: 'on' },
        },
      ],
      targets: {
        on: {
          user: {
            userId: [{ value: 'user_123' }],
          },
        },
      },
    };
    client.setArgv(
      'flags',
      'rollout',
      testFlags[0].slug,
      '--environment',
      'production',
      '--by',
      'user.userId',
      '--stage',
      '20,6h'
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
          id: 'rule_custom',
          outcome: { type: 'variant', variantId: 'on' },
        },
      ],
      targets: {
        on: {
          user: {
            userId: [{ value: 'user_123' }],
          },
        },
      },
    });
  });

  it('errors when --by is missing for a new rollout', async () => {
    client.setArgv(
      'flags',
      'rollout',
      testFlags[0].slug,
      '--environment',
      'production',
      '--stage',
      '10,6h'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Missing required flag --by'
    );
  });

  it('errors when a non-boolean rollout omits --to-variant', async () => {
    client.setArgv(
      'flags',
      'rollout',
      testFlags[1].slug,
      '--environment',
      'production',
      '--by',
      'user.userId',
      '--from-variant',
      'control',
      '--stage',
      '10,6h'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Missing required flag --to-variant'
    );
  });

  it('errors when the stage schedule is not ascending', async () => {
    client.setArgv(
      'flags',
      'rollout',
      testFlags[0].slug,
      '--environment',
      'production',
      '--by',
      'user.userId',
      '--stage',
      '25,6h',
      '--stage',
      '10,6h'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Stage percentages must be in ascending order.'
    );
  });
});
