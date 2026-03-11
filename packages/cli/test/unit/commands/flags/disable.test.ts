import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import flags from '../../../../src/commands/flags';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useFlags } from '../../../mocks/flags';
import type { Flag } from '../../../../src/util/flags/types';

// Helper to create fresh flag data for each test
function createTestFlags(): Flag[] {
  return [
    {
      id: 'flag_abc123',
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
          active: true,
          fallthrough: { type: 'variant', variantId: 'off' },
          pausedOutcome: { type: 'variant', variantId: 'off' },
          rules: [],
        },
        preview: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'on' },
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
      id: 'flag_def456',
      slug: 'another-feature',
      description: 'Another feature flag',
      kind: 'string',
      state: 'active',
      variants: [
        { id: 'default', value: 'control', label: 'Control' },
        { id: 'variant-a', value: 'variant-a', label: 'Variant A' },
      ],
      environments: {
        production: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'default' },
          pausedOutcome: { type: 'variant', variantId: 'default' },
          rules: [],
        },
        preview: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'default' },
          pausedOutcome: { type: 'variant', variantId: 'default' },
          rules: [],
        },
        development: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'default' },
          pausedOutcome: { type: 'variant', variantId: 'default' },
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

describe('flags disable', () => {
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
    textMock.mockResolvedValue('');
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'flags';
      const subcommand = 'disable';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = flags(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  it('tracks `disable` subcommand', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'disable',
      testFlags[0].slug,
      '--environment',
      'production'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:disable',
        value: 'disable',
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

  it('tracks the message option', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'disable',
      testFlags[0].slug,
      '--environment',
      'production',
      '--message',
      'Pause production rollout'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:disable',
        value: 'disable',
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
        key: 'option:message',
        value: '[REDACTED]',
      },
    ]);
  });

  it('disables a flag successfully', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'disable',
      testFlags[0].slug,
      '--environment',
      'production'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    const output = client.stderr.getFullOutput();
    expect(stripAnsi(output)).toContain('Serving variant: false Off');
    expect(output).toContain(chalk.dim('Off'));
    expect((testFlags[0] as Flag & { message?: string }).message).toEqual(
      'Disabled for production via CLI'
    );
    expect(testFlags[0].environments.production).toMatchObject({
      active: false,
      pausedOutcome: { type: 'variant', variantId: 'off' },
      fallthrough: { type: 'variant', variantId: 'off' },
    });
  });

  describe('--variant', () => {
    it('tracks `variant` option', async () => {
      client.setArgv(
        'flags',
        'disable',
        testFlags[0].slug,
        '--environment',
        'production',
        '--variant',
        'off'
      );
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:disable',
          value: 'disable',
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
          key: 'option:variant',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  it('errors without flag argument', async () => {
    client.setArgv('flags', 'disable');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
  });

  it('errors when invalid variant is provided', async () => {
    client.setArgv(
      'flags',
      'disable',
      testFlags[0].slug,
      '--environment',
      'production',
      '--variant',
      'nonexistent-variant'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Variant "nonexistent-variant" not found'
    );
  });

  it('redacts telemetry for invalid environment values', async () => {
    client.setArgv(
      'flags',
      'disable',
      testFlags[0].slug,
      '--environment',
      'invalid'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:disable',
        value: 'disable',
      },
      {
        key: 'argument:flag',
        value: '[REDACTED]',
      },
      {
        key: 'option:environment',
        value: '[REDACTED]',
      },
    ]);
  });

  it('resolves variant by value (true/false)', async () => {
    // Change variant IDs to random strings (like real API)
    testFlags[0].variants = [
      { id: 'abc123xyz', value: false, label: 'Off' },
      { id: 'def456uvw', value: true, label: 'On' },
    ];

    client.setArgv(
      'flags',
      'disable',
      testFlags[0].slug,
      '--environment',
      'production',
      '--variant',
      'false'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    const output = client.stderr.getFullOutput();
    expect(stripAnsi(output)).toContain('Serving variant: false Off');
    expect(output).toContain(chalk.dim('Off'));
    expect(testFlags[0].environments.production).toMatchObject({
      pausedOutcome: { type: 'variant', variantId: 'abc123xyz' },
    });
  });

  it('resolves variant by "true"/"false" keywords', async () => {
    // Change variant IDs to random strings (like real API)
    testFlags[0].variants = [
      { id: 'random_id_1', value: false, label: 'Disabled' },
      { id: 'random_id_2', value: true, label: 'Enabled' },
    ];

    client.setArgv(
      'flags',
      'disable',
      testFlags[0].slug,
      '--environment',
      'production',
      '--variant',
      'false'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    const output = client.stderr.getFullOutput();
    expect(stripAnsi(output)).toContain('Serving variant: false Disabled');
    expect(output).toContain(chalk.dim('Disabled'));
    expect(testFlags[0].environments.production).toMatchObject({
      pausedOutcome: { type: 'variant', variantId: 'random_id_1' },
    });
  });

  it('resolves variant by label', async () => {
    // Change variant IDs to random strings (like real API)
    testFlags[0].variants = [
      { id: 'uuid_style_id_1', value: false, label: 'Disabled' },
      { id: 'uuid_style_id_2', value: true, label: 'Enabled' },
    ];

    client.setArgv(
      'flags',
      'disable',
      testFlags[0].slug,
      '--environment',
      'production',
      '--variant',
      'Disabled'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    const output = client.stderr.getFullOutput();
    expect(stripAnsi(output)).toContain('Serving variant: false Disabled');
    expect(output).toContain(chalk.dim('Disabled'));
    expect(testFlags[0].environments.production).toMatchObject({
      pausedOutcome: { type: 'variant', variantId: 'uuid_style_id_1' },
    });
  });

  it('shows helpful error with available variants when not found', async () => {
    // Change variant IDs to random strings (like real API)
    testFlags[0].variants = [
      { id: 'abcdef123', value: false, label: 'Off' },
      { id: 'ghijkl456', value: true, label: 'On' },
    ];

    client.setArgv(
      'flags',
      'disable',
      testFlags[0].slug,
      '--environment',
      'production',
      '--variant',
      'invalid-variant'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Variant "invalid-variant" not found');
    expect(output).toContain('Available variants:');
    // Should show values, not just IDs
    expect(output).toContain('false');
    expect(output).toContain('true');
  });

  it('auto-selects false variant for boolean flags without prompting', async () => {
    // testFlags[0] is a boolean flag with variants: off (false), on (true)
    client.setArgv(
      'flags',
      'disable',
      testFlags[0].slug,
      '--environment',
      'production'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    // Should not prompt for variant selection
    expect(selectMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('variant'),
      })
    );
    const output = client.stderr.getFullOutput();
    expect(stripAnsi(output)).toContain('Serving variant: false Off');
    expect(output).toContain(chalk.dim('Off'));
    expect(testFlags[0].environments.production).toMatchObject({
      pausedOutcome: { type: 'variant', variantId: 'off' },
      fallthrough: { type: 'variant', variantId: 'off' },
    });
  });

  it('warns for non-boolean flags with helpful message', async () => {
    // testFlags[1] is a string flag
    client.setArgv(
      'flags',
      'disable',
      testFlags[1].slug,
      '--environment',
      'production'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    const output = stripAnsi(client.stderr.getFullOutput());
    // Should show warning about boolean-only
    expect(output).toContain('only works with boolean flags');
    // Should identify the flag type
    expect(output).toContain('string');
    expect(output).toContain('You can update it on the dashboard');
    // Should show dashboard link
    expect(output).toContain('https://vercel.com/');
    expect(output).toContain(testFlags[1].slug);
  });

  it('prompts for environment when not specified', async () => {
    selectMock.mockResolvedValueOnce('production');
    client.setArgv('flags', 'disable', testFlags[0].slug);
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(selectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Select an environment to disable the flag in:',
        choices: expect.arrayContaining([
          expect.objectContaining({ value: 'production' }),
          expect.objectContaining({ value: 'preview' }),
          expect.objectContaining({ value: 'development' }),
        ]),
      })
    );
    const selectCall = selectMock.mock.calls[0][0];
    expect(
      selectCall.choices.map((choice: { value: string }) => choice.value)
    ).toEqual(['production', 'preview', 'development']);
    expect(textMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Enter a message for this update:',
        default: 'Disabled for production via CLI',
      })
    );
  });

  it('errors in non-interactive mode when environment is missing', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv('flags', 'disable', testFlags[0].slug);

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Missing required flag --environment'
    );
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('sends a custom revision message', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'disable',
      testFlags[0].slug,
      '--environment',
      'production',
      '--message',
      'Pause production rollout'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect((testFlags[0] as Flag & { message?: string }).message).toEqual(
      'Pause production rollout'
    );
  });

  it('uses the default message when the interactive prompt is accepted', async () => {
    client.setArgv(
      'flags',
      'disable',
      testFlags[0].slug,
      '--environment',
      'production'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(textMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Enter a message for this update:',
        default: 'Disabled for production via CLI',
      })
    );
    expect((testFlags[0] as Flag & { message?: string }).message).toEqual(
      'Disabled for production via CLI'
    );
  });

  it('warns when flag is already disabled in environment', async () => {
    // Set production to already disabled with the off variant
    testFlags[0].environments.production.active = false;
    testFlags[0].environments.production.pausedOutcome = {
      type: 'variant',
      variantId: 'off',
    };
    testFlags[0].environments.production.fallthrough = {
      type: 'variant',
      variantId: 'off',
    };

    client.setArgv(
      'flags',
      'disable',
      testFlags[0].slug,
      '--environment',
      'production'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain('already disabled');
  });

  it('disables a forced-on environment by switching it to the off variant', async () => {
    (client.stdin as any).isTTY = false;
    testFlags[0].environments.production.active = false;
    testFlags[0].environments.production.pausedOutcome = {
      type: 'variant',
      variantId: 'on',
    };
    testFlags[0].environments.production.fallthrough = {
      type: 'variant',
      variantId: 'on',
    };

    client.setArgv(
      'flags',
      'disable',
      testFlags[0].slug,
      '--environment',
      'production'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(testFlags[0].environments.production).toMatchObject({
      active: false,
      pausedOutcome: { type: 'variant', variantId: 'off' },
      fallthrough: { type: 'variant', variantId: 'on' },
    });
  });

  it('preserves custom rules, targets, and fallthrough when disabling a flag', async () => {
    (client.stdin as any).isTTY = false;
    testFlags[0].environments.production = {
      active: true,
      pausedOutcome: { type: 'variant', variantId: 'off' },
      fallthrough: {
        type: 'split',
        base: {
          type: 'entity',
          kind: 'user',
          attribute: 'userId',
        },
        weights: {
          off: 10,
          on: 90,
        },
        defaultVariantId: 'off',
      },
      rules: [
        {
          id: 'rule_custom',
          conditions: [
            {
              lhs: { type: 'entity', kind: 'user', attribute: 'plan' },
              cmp: 'eq',
              rhs: 'pro',
            },
          ],
          outcome: { type: 'variant', variantId: 'on' },
        },
      ],
      targets: {
        on: {
          user: {
            userId: [{ value: 'user_456' }],
          },
        },
      },
    };
    client.setArgv(
      'flags',
      'disable',
      testFlags[0].slug,
      '--environment',
      'production'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(testFlags[0].environments.production).toMatchObject({
      active: false,
      pausedOutcome: { type: 'variant', variantId: 'off' },
      fallthrough: {
        type: 'split',
        base: {
          type: 'entity',
          kind: 'user',
          attribute: 'userId',
        },
        weights: {
          off: 10,
          on: 90,
        },
        defaultVariantId: 'off',
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
            userId: [{ value: 'user_456' }],
          },
        },
      },
    });
  });

  it('errors when flag is archived', async () => {
    // Set flag to archived (mock uses testFlags reference)
    testFlags[0].state = 'archived';

    client.setArgv(
      'flags',
      'disable',
      testFlags[0].slug,
      '--environment',
      'production'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain('archived');
  });
});
