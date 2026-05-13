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

describe('flags split', () => {
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
      client.setArgv('flags', 'split', '--help');

      const exitCodePromise = flags(client);

      await expect(exitCodePromise).resolves.toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'flags:split',
        },
      ]);
    });
  });

  it('tracks split usage', async () => {
    client.setArgv(
      'flags',
      'split',
      testFlags[0].slug,
      '--environment',
      'production',
      '--by',
      'user.userId',
      '--weight',
      'off=95',
      '--weight',
      'on=5',
      '--message',
      'Start weighted split'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:split',
        value: 'split',
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
        key: 'option:weight',
        value: '[REDACTED]',
      },
      {
        key: 'option:message',
        value: '[REDACTED]',
      },
    ]);
  });

  it('configures a boolean split with an inferred fallback variant', async () => {
    client.setArgv(
      'flags',
      'split',
      testFlags[0].slug,
      '--environment',
      'production',
      '--by',
      'user.userId',
      '--weight',
      'off=95',
      '--weight',
      'on=5'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(testFlags[0].environments.production).toMatchObject({
      active: true,
      pausedOutcome: { type: 'variant', variantId: 'off' },
      fallthrough: {
        type: 'split',
        base: {
          type: 'entity',
          kind: 'user',
          attribute: 'userId',
        },
        defaultVariantId: 'off',
        weights: {
          off: 95,
          on: 5,
        },
      },
    });
    expect((testFlags[0] as Flag & { message?: string }).message).toEqual(
      'Configure split for production: false Off: 95%, true On: 5%'
    );

    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toContain('split has been updated in production');
    expect(output).toContain('Based on: user.userId');
    expect(output).toContain('Fallback: false Off');
    expect(output).toContain('Weights: false Off: 95%, true On: 5%');
  });

  it('prompts for the fallback variant when configuring a boolean split interactively', async () => {
    (client.stdin as any).isTTY = true;
    selectMock.mockResolvedValueOnce('on');
    textMock.mockResolvedValueOnce('');
    client.setArgv(
      'flags',
      'split',
      testFlags[0].slug,
      '--environment',
      'production',
      '--by',
      'user.userId',
      '--weight',
      'off=95',
      '--weight',
      'on=5'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(selectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Select a fallback variant:',
        default: 'off',
      })
    );
    expect(testFlags[0].environments.production).toMatchObject({
      fallthrough: {
        type: 'split',
        defaultVariantId: 'on',
        weights: {
          off: 95,
          on: 5,
        },
      },
    });
  });

  it('configures a string split with an explicit fallback variant', async () => {
    client.setArgv(
      'flags',
      'split',
      testFlags[1].slug,
      '--environment',
      'preview',
      '--by',
      'user.userId',
      '--default-variant',
      'control',
      '--weight',
      'control=80',
      '--weight',
      'treatment=20'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(testFlags[1].environments.preview).toMatchObject({
      active: true,
      fallthrough: {
        type: 'split',
        base: {
          type: 'entity',
          kind: 'user',
          attribute: 'userId',
        },
        defaultVariantId: 'control',
        weights: {
          control: 80,
          treatment: 20,
        },
      },
    });
  });

  it('warns when the split is already configured', async () => {
    testFlags[1].environments.production.fallthrough = {
      type: 'split',
      base: {
        type: 'entity',
        kind: 'user',
        attribute: 'userId',
      },
      defaultVariantId: 'control',
      weights: {
        control: 75,
        treatment: 25,
      },
    };

    client.setArgv(
      'flags',
      'split',
      testFlags[1].slug,
      '--environment',
      'production',
      '--by',
      'user.userId',
      '--default-variant',
      'control',
      '--weight',
      'control=75',
      '--weight',
      'treatment=25'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'is already configured with this split in production'
    );
    expect((testFlags[1] as Flag & { message?: string }).message).toBe(
      undefined
    );
  });

  it('preserves the current split when only the message changes', async () => {
    testFlags[1].environments.production.fallthrough = {
      type: 'split',
      base: {
        type: 'entity',
        kind: 'user',
        attribute: 'userId',
      },
      defaultVariantId: 'control',
      weights: {
        control: 75,
        treatment: 25,
      },
    };

    client.setArgv(
      'flags',
      'split',
      testFlags[1].slug,
      '--environment',
      'production',
      '--message',
      'Keep split active'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(testFlags[1].environments.production.fallthrough).toEqual({
      type: 'split',
      base: {
        type: 'entity',
        kind: 'user',
        attribute: 'userId',
      },
      defaultVariantId: 'control',
      weights: {
        control: 75,
        treatment: 25,
      },
    });
    expect((testFlags[1] as Flag & { message?: string }).message).toEqual(
      'Keep split active'
    );
  });

  it('does not prompt to edit an existing split when only the message changes interactively', async () => {
    testFlags[1].environments.production.fallthrough = {
      type: 'split',
      base: {
        type: 'entity',
        kind: 'user',
        attribute: 'userId',
      },
      defaultVariantId: 'control',
      weights: {
        control: 75,
        treatment: 25,
      },
    };
    (client.stdin as any).isTTY = true;

    client.setArgv(
      'flags',
      'split',
      testFlags[1].slug,
      '--environment',
      'production',
      '--message',
      'Keep split active'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(selectMock).not.toHaveBeenCalled();
    expect(textMock).not.toHaveBeenCalled();
    expect(testFlags[1].environments.production.fallthrough).toEqual({
      type: 'split',
      base: {
        type: 'entity',
        kind: 'user',
        attribute: 'userId',
      },
      defaultVariantId: 'control',
      weights: {
        control: 75,
        treatment: 25,
      },
    });
    expect((testFlags[1] as Flag & { message?: string }).message).toEqual(
      'Keep split active'
    );
  });

  it('errors when a new split is missing weights in non-interactive mode', async () => {
    client.setArgv(
      'flags',
      'split',
      testFlags[0].slug,
      '--environment',
      'production',
      '--by',
      'user.userId'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'At least one --weight is required'
    );
  });

  it('errors when a provided weight is empty', async () => {
    client.setArgv(
      'flags',
      'split',
      testFlags[0].slug,
      '--environment',
      'production',
      '--by',
      'user.userId',
      '--weight',
      'off=   ',
      '--weight',
      'on=5'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'Weight cannot be empty'
    );
  });

  it('errors when a provided distribution omits a variant', async () => {
    client.setArgv(
      'flags',
      'split',
      testFlags[0].slug,
      '--environment',
      'production',
      '--by',
      'user.userId',
      '--weight',
      'on=5'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'Missing weights for variants: false Off'
    );
  });

  it('errors when a non-boolean split omits the fallback variant', async () => {
    client.setArgv(
      'flags',
      'split',
      testFlags[1].slug,
      '--environment',
      'production',
      '--by',
      'user.userId',
      '--weight',
      'control=90',
      '--weight',
      'treatment=10'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'Missing required flag --default-variant'
    );
  });

  it('prompts for split details in interactive mode', async () => {
    (client.stdin as any).isTTY = true;
    selectMock
      .mockResolvedValueOnce('user.userId')
      .mockResolvedValueOnce('control');
    textMock
      .mockResolvedValueOnce('70')
      .mockResolvedValueOnce('30')
      .mockResolvedValueOnce('');
    client.setArgv(
      'flags',
      'split',
      testFlags[1].slug,
      '--environment',
      'production'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(selectMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        message: 'Select an attribute to split by:',
      })
    );
    expect(selectMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        message: 'Select a fallback variant:',
      })
    );
    expect(textMock).toHaveBeenCalledTimes(3);
    expect(testFlags[1].environments.production).toMatchObject({
      fallthrough: {
        type: 'split',
        base: {
          type: 'entity',
          kind: 'user',
          attribute: 'userId',
        },
        defaultVariantId: 'control',
        weights: {
          control: 70,
          treatment: 30,
        },
      },
    });
  });

  it('prompts with current split values when editing an existing split interactively', async () => {
    testFlags[1].environments.production.fallthrough = {
      type: 'split',
      base: {
        type: 'entity',
        kind: 'user',
        attribute: 'userId',
      },
      defaultVariantId: 'control',
      weights: {
        control: 75,
        treatment: 25,
      },
    };
    (client.stdin as any).isTTY = true;
    selectMock
      .mockResolvedValueOnce('user.plan')
      .mockResolvedValueOnce('treatment');
    textMock
      .mockResolvedValueOnce('40')
      .mockResolvedValueOnce('60')
      .mockResolvedValueOnce('');
    client.setArgv(
      'flags',
      'split',
      testFlags[1].slug,
      '--environment',
      'production'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(selectMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        message: 'Select an attribute to split by:',
        default: 'user.userId',
      })
    );
    expect(selectMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        message: 'Select a fallback variant:',
        default: 'control',
      })
    );
    expect(textMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        message: 'Weight for "control" Control:',
        default: '75',
      })
    );
    expect(textMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        message: 'Weight for "treatment" Treatment:',
        default: '25',
      })
    );
    expect(testFlags[1].environments.production).toMatchObject({
      fallthrough: {
        type: 'split',
        base: {
          type: 'entity',
          kind: 'user',
          attribute: 'plan',
        },
        defaultVariantId: 'treatment',
        weights: {
          control: 40,
          treatment: 60,
        },
      },
    });
  });
});
