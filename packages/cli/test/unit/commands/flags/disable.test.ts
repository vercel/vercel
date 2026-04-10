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

  it('emits structured JSON in non-interactive mode when flag slug is missing', async () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as () => never);
    client.nonInteractive = true;
    client.setArgv('flags', 'disable', '--cwd', '/tmp', '--non-interactive');

    const exitCode = await flags(client);

    expect(exitCode).toBe(1);
    const out = client.stdout.getFullOutput();
    const parsed = JSON.parse(out);
    expect(parsed.status).toBe('error');
    expect(parsed.reason).toBe('missing_arguments');
    expect(parsed.message).toContain('flag');
    expect(parsed.next).toBeDefined();
    expect(parsed.next.length).toBeGreaterThan(0);
    expect(parsed.next[0].command).toContain('flags disable');
    expect(parsed.next[0].command).toContain('--cwd');
    expect(parsed.next[0].command).toContain('VERCEL_NON_INTERACTIVE=1');
    exitSpy.mockRestore();
    client.nonInteractive = false;
  });

  it('substitutes --environment in suggested command when provided and flag slug is missing', async () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as () => never);
    client.nonInteractive = true;
    client.setArgv(
      'flags',
      'disable',
      '--environment',
      'production',
      '--cwd',
      '/tmp',
      '--non-interactive'
    );

    const exitCode = await flags(client);

    expect(exitCode).toBe(1);
    const out = client.stdout.getFullOutput();
    const parsed = JSON.parse(out);
    expect(parsed.next[0].command).toContain('--environment production');
    expect(parsed.next[0].command).not.toContain(
      '--environment <production|preview|development>'
    );
    exitSpy.mockRestore();
    client.nonInteractive = false;
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

  it('does not resolve explicit variants by label', async () => {
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
    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'You can specify a variant by its ID or value.'
    );
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

  it('warns for non-boolean flags with variants and non-interactive set guidance', async () => {
    // testFlags[1] is a string flag
    (client.stdin as any).isTTY = false;
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
    expect(output).toContain('Set a specific variant instead');
    expect(output).toContain(
      `vercel flags set ${testFlags[1].slug} --environment production --variant <VARIANT>`
    );
    expect(output).toContain('Available variants:');
    expect(output).toContain('"control" Control');
    expect(output).toContain('"variant-a" Variant A');
    expect(output).toContain(`vercel flags inspect ${testFlags[1].slug}`);
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

  it('emits structured JSON in non-interactive mode when --environment is missing', async () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as () => never);
    client.nonInteractive = true;
    client.setArgv(
      'flags',
      'disable',
      testFlags[0].slug,
      '--cwd',
      '/tmp',
      '--non-interactive'
    );

    const exitCode = await flags(client);

    expect(exitCode).toBe(1);
    const out = client.stdout.getFullOutput();
    const parsed = JSON.parse(out);
    expect(parsed.status).toBe('error');
    expect(parsed.reason).toBe('missing_arguments');
    expect(parsed.message).toContain('--environment');
    expect(parsed.next).toBeDefined();
    expect(parsed.next.length).toBeGreaterThan(0);
    expect(parsed.next[0].command).toContain('flags disable');
    expect(parsed.next[0].command).toContain(testFlags[0].slug);
    expect(parsed.next[0].command).toContain('--environment');
    expect(parsed.next[0].command).toContain('--cwd');
    expect(parsed.next[0].command).toContain('VERCEL_NON_INTERACTIVE=1');
    exitSpy.mockRestore();
    client.nonInteractive = false;
  });

  it('emits structured JSON in non-interactive mode when --environment is invalid', async () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as () => never);
    client.nonInteractive = true;
    client.setArgv(
      'flags',
      'disable',
      testFlags[0].slug,
      '--environment',
      'prod',
      '--cwd',
      '/tmp',
      '--non-interactive'
    );

    const exitCode = await flags(client);

    expect(exitCode).toBe(1);
    const out = client.stdout.getFullOutput();
    const parsed = JSON.parse(out);
    expect(parsed.status).toBe('error');
    expect(parsed.reason).toBe('invalid_arguments');
    expect(parsed.message).toContain('Invalid environment');
    expect(parsed.message).toContain('prod');
    expect(parsed.next).toBeDefined();
    expect(parsed.next.length).toBeGreaterThan(0);
    expect(parsed.next[0].command).toContain('flags disable');
    expect(parsed.next[0].command).toContain(testFlags[0].slug);
    expect(parsed.next[0].command).toContain('--environment');
    expect(parsed.next[0].command).toContain('--cwd');
    expect(parsed.next[0].command).toContain('VERCEL_NON_INTERACTIVE=1');
    exitSpy.mockRestore();
    client.nonInteractive = false;
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
