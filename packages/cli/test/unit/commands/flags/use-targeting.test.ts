import stripAnsi from 'strip-ansi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
          active: false,
          fallthrough: { type: 'variant', variantId: 'off' },
          pausedOutcome: { type: 'variant', variantId: 'off' },
          rules: [],
        },
        development: {
          active: false,
          fallthrough: { type: 'variant', variantId: 'on' },
          pausedOutcome: { type: 'variant', variantId: 'on' },
          rules: [],
        },
      },
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      createdBy: 'user_123',
      projectId: 'prj_123',
      ownerId: 'team_dummy',
      revision: 1,
      seed: 1,
      typeName: 'flag',
    },
  ];
}

describe('flags use-targeting', () => {
  const selectMock = vi.fn();
  const textMock = vi.fn();
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
    client.input.select = selectMock;
    client.input.text = textMock;
    selectMock.mockReset();
    textMock.mockReset();
    (client.stdin as any).isTTY = false;
    client.nonInteractive = false;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('flags', 'use-targeting', '--help');

      const exitCodePromise = flags(client);

      await expect(exitCodePromise).resolves.toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'flags:use-targeting',
        },
      ]);
    });
  });

  it('resumes targeting and keeps the current fallthrough', async () => {
    testFlags[0].environments.production.active = false;
    testFlags[0].environments.production.rules = [
      {
        id: 'rule_time',
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
      'use-targeting',
      testFlags[0].slug,
      '--environment',
      'production'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toContain('now uses targeting');
    expect(output).toContain('Fallthrough: Off');
    expect((testFlags[0] as Flag & { message?: string }).message).toEqual(
      'Activated targeting for production via CLI'
    );
    expect(testFlags[0].environments.production).toMatchObject({
      active: true,
      fallthrough: { type: 'variant', variantId: 'off' },
      pausedOutcome: { type: 'variant', variantId: 'off' },
    });
    expect(testFlags[0].environments.production.rules).toHaveLength(1);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:use-targeting',
        value: 'use-targeting',
      },
      {
        key: 'argument:flag',
        value: '[REDACTED]',
      },
      {
        key: 'option:environment',
        value: 'production',
      },
    ]);
  });

  it('preserves a split fallthrough when resuming after disable', async () => {
    const splitFallthrough = {
      type: 'split' as const,
      base: { type: 'entity' as const, kind: 'user', attribute: 'userId' },
      weights: { off: 95, on: 5 },
      defaultVariantId: 'off',
    };
    testFlags[0].environments.production = {
      active: false,
      fallthrough: splitFallthrough,
      pausedOutcome: { type: 'variant', variantId: 'off' },
      rules: [],
    };

    client.setArgv(
      'flags',
      'use-targeting',
      testFlags[0].slug,
      '--environment',
      'production'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(testFlags[0].environments.production).toMatchObject({
      active: true,
      fallthrough: splitFallthrough,
      pausedOutcome: { type: 'variant', variantId: 'off' },
    });
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'Fallthrough: split ('
    );
  });

  it('replaces fallthrough when --default-variant is set', async () => {
    testFlags[0].environments.production = {
      active: false,
      fallthrough: {
        type: 'split',
        base: { type: 'entity', kind: 'user', attribute: 'userId' },
        weights: { off: 95, on: 5 },
        defaultVariantId: 'off',
      },
      pausedOutcome: { type: 'variant', variantId: 'off' },
      rules: [],
    };

    client.setArgv(
      'flags',
      'use-targeting',
      testFlags[0].slug,
      '--environment',
      'production',
      '--default-variant',
      'false'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(testFlags[0].environments.production).toMatchObject({
      active: true,
      fallthrough: { type: 'variant', variantId: 'off' },
    });
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'Fallthrough: Off'
    );
  });

  it('no-ops when targeting already serves the same default variant', async () => {
    testFlags[0].environments.production.active = true;
    testFlags[0].environments.production.fallthrough = {
      type: 'variant',
      variantId: 'off',
    };

    client.setArgv(
      'flags',
      'use-targeting',
      testFlags[0].slug,
      '--environment',
      'production',
      '--default-variant',
      'false'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'already uses targeting with default Off (false)'
    );
  });

  it('no-ops when resuming targeting that is already active', async () => {
    testFlags[0].environments.production.active = true;

    client.setArgv(
      'flags',
      'use-targeting',
      testFlags[0].slug,
      '--environment',
      'production'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'already uses targeting with default Off (false)'
    );
  });

  it('activates targeting when the environment reuses another environment', async () => {
    testFlags[0].environments.preview.fallthrough = {
      type: 'split',
      base: { type: 'entity', kind: 'user', attribute: 'userId' },
      weights: { off: 80, on: 20 },
      defaultVariantId: 'off',
    };
    testFlags[0].environments.production = {
      active: true,
      reuse: {
        active: true,
        environment: 'preview',
      },
      fallthrough: { type: 'variant', variantId: 'off' },
      pausedOutcome: { type: 'variant', variantId: 'off' },
      rules: [],
    };

    client.setArgv(
      'flags',
      'use-targeting',
      testFlags[0].slug,
      '--environment',
      'production'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toContain('now uses targeting');
    expect(output).not.toContain('already uses targeting');
    expect(testFlags[0].environments.production).toMatchObject({
      active: true,
      reuse: {
        active: false,
        environment: 'preview',
      },
      fallthrough: {
        type: 'split',
        defaultVariantId: 'off',
        weights: { off: 80, on: 20 },
      },
    });
  });

  it('errors for an orphan fallthrough without --default-variant in non-interactive mode', async () => {
    testFlags[0].environments.production.fallthrough = {
      type: 'variant',
      variantId: 'missing-variant',
    };

    client.setArgv(
      'flags',
      'use-targeting',
      testFlags[0].slug,
      '--environment',
      'production'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Pass --default-variant <VARIANT>'
    );
  });

  it('errors when --non-interactive is set even if stdin is a TTY', async () => {
    (client.stdin as any).isTTY = true;
    client.nonInteractive = true;
    testFlags[0].environments.production.fallthrough = {
      type: 'variant',
      variantId: 'missing-variant',
    };

    client.setArgv(
      'flags',
      'use-targeting',
      testFlags[0].slug,
      '--environment',
      'production',
      '--non-interactive'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(selectMock).not.toHaveBeenCalled();
    expect(client.stderr.getFullOutput()).toContain(
      'Pass --default-variant <VARIANT>'
    );
  });
});
