import chalk from 'chalk';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import flags from '../../../../src/commands/flags';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useFlags } from '../../../mocks/flags';
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
      id: 'flag_string456',
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
    {
      id: 'flag_number789',
      slug: 'bucket-size',
      description: 'A numeric feature flag',
      kind: 'number',
      state: 'active',
      variants: [
        { id: 'small', value: 10, label: 'Small' },
        { id: 'large', value: 20, label: 'Large' },
      ],
      environments: {
        production: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'small' },
          pausedOutcome: { type: 'variant', variantId: 'small' },
          rules: [],
        },
        preview: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'small' },
          pausedOutcome: { type: 'variant', variantId: 'small' },
          rules: [],
        },
        development: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'small' },
          pausedOutcome: { type: 'variant', variantId: 'small' },
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
    {
      id: 'flag_json999',
      slug: 'layout-config',
      description: 'A JSON feature flag',
      kind: 'json',
      state: 'active',
      variants: [
        {
          id: 'light',
          value: { theme: 'light', sidebar: false },
          label: 'Light',
        },
        {
          id: 'dark',
          value: ['dark', 'compact'],
          label: 'Dark',
        },
      ],
      environments: {
        production: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'light' },
          pausedOutcome: { type: 'variant', variantId: 'light' },
          rules: [],
        },
        preview: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'light' },
          pausedOutcome: { type: 'variant', variantId: 'light' },
          rules: [],
        },
        development: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'light' },
          pausedOutcome: { type: 'variant', variantId: 'light' },
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

describe('flags update', () => {
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
    (client.stdin as any).isTTY = true;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'flags';
      const subcommand = 'update';

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

  it('tracks update usage', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'update',
      testFlags[1].slug,
      '--variant',
      'control',
      '--value',
      'welcome-back',
      '--label',
      'Welcome back'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:update',
        value: 'update',
      },
      {
        key: 'argument:flag',
        value: '[REDACTED]',
      },
      {
        key: 'option:variant',
        value: '[REDACTED]',
      },
      {
        key: 'option:value',
        value: '[REDACTED]',
      },
      {
        key: 'option:label',
        value: '[REDACTED]',
      },
    ]);
  });

  it('tracks the message option', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'update',
      testFlags[1].slug,
      '--variant',
      'control',
      '--label',
      'Welcome back',
      '--message',
      'Rename control variant'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:update',
        value: 'update',
      },
      {
        key: 'argument:flag',
        value: '[REDACTED]',
      },
      {
        key: 'option:variant',
        value: '[REDACTED]',
      },
      {
        key: 'option:label',
        value: '[REDACTED]',
      },
      {
        key: 'option:message',
        value: '[REDACTED]',
      },
    ]);
  });

  it('updates string variant values and labels', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'update',
      testFlags[1].slug,
      '--variant',
      'control',
      '--value',
      'welcome-back',
      '--label',
      'Welcome back'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(testFlags[1].variants).toMatchObject([
      { id: 'default', value: 'welcome-back', label: 'Welcome back' },
      { id: 'variant-a', value: 'variant-a', label: 'Variant A' },
    ]);
    expect((testFlags[1] as Flag & { message?: string }).message).toEqual(
      'Updated via CLI'
    );
  });

  it('sends the provided revision message', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'update',
      testFlags[1].slug,
      '--variant',
      'control',
      '--label',
      'Welcome back',
      '--message',
      'Rename control variant'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect((testFlags[1] as Flag & { message?: string }).message).toEqual(
      'Rename control variant'
    );
  });

  it('updates number variants', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'update',
      testFlags[2].slug,
      '--variant',
      'small',
      '--value',
      '15',
      '--label',
      'Medium'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(testFlags[2].variants).toMatchObject([
      { id: 'small', value: 15, label: 'Medium' },
      { id: 'large', value: 20, label: 'Large' },
    ]);
  });

  it('updates JSON variants by value', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'update',
      testFlags[3].slug,
      '--variant',
      '{"theme":"light","sidebar":false}',
      '--value',
      '{"theme":"light","sidebar":true}',
      '--label',
      'Light+'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(testFlags[3].variants).toMatchObject([
      {
        id: 'light',
        value: { theme: 'light', sidebar: true },
        label: 'Light+',
      },
      { id: 'dark', value: ['dark', 'compact'], label: 'Dark' },
    ]);
  });

  it('rejects invalid JSON updates', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'update',
      testFlags[3].slug,
      '--variant',
      'light',
      '--value',
      '{"theme":"light"'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'JSON variant values must be valid JSON'
    );
  });

  it('allows label-only boolean updates when the value stays the same', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'update',
      testFlags[0].slug,
      '--variant',
      'false',
      '--label',
      'Disabled'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(testFlags[0].variants).toMatchObject([
      { id: 'off', value: false, label: 'Disabled' },
      { id: 'on', value: true, label: 'On' },
    ]);
  });

  it('rejects attempts to change boolean variant values', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'update',
      testFlags[0].slug,
      '--variant',
      'false',
      '--value',
      'true',
      '--label',
      'Enabled'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Boolean variant values cannot be changed'
    );
  });

  it('does not resolve explicit selectors by label', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'update',
      testFlags[1].slug,
      '--variant',
      'Control',
      '--value',
      'welcome-back',
      '--label',
      'Welcome back'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'You can specify a variant by its ID or value.'
    );
  });

  it('prompts for missing value and label when variant is provided', async () => {
    textMock
      .mockResolvedValueOnce('welcome-back')
      .mockResolvedValueOnce('Welcome back')
      .mockResolvedValueOnce('Rename control variant');

    client.setArgv(
      'flags',
      'update',
      testFlags[1].slug,
      '--variant',
      'control'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(selectMock).not.toHaveBeenCalled();
    expect(textMock).toHaveBeenCalledTimes(3);
    expect(textMock.mock.calls[0][0].message).toContain('Enter a new value');
    expect(textMock.mock.calls[1][0].message).toContain('Enter a new label');
    expect(textMock.mock.calls[2][0].message).toContain('Enter a message');
    expect(textMock.mock.calls[2][0].default).toEqual('Updated via CLI');
    expect(testFlags[1].variants[0]).toMatchObject({
      id: 'default',
      value: 'welcome-back',
      label: 'Welcome back',
    });
    expect((testFlags[1] as Flag & { message?: string }).message).toEqual(
      'Rename control variant'
    );
  });

  it('supports interactive fallback', async () => {
    selectMock.mockResolvedValueOnce('default');
    textMock
      .mockResolvedValueOnce('welcome-back')
      .mockResolvedValueOnce('Welcome back')
      .mockResolvedValueOnce('Rename control variant');

    client.setArgv('flags', 'update', testFlags[1].slug);

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(selectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Select a variant to update:',
        choices: [
          {
            name: `"control" Control ${chalk.dim('[id: default]')}`,
            value: 'default',
          },
          {
            name: `"variant-a" Variant A ${chalk.dim('[id: variant-a]')}`,
            value: 'variant-a',
          },
        ],
      })
    );
    expect(testFlags[1].variants[0]).toMatchObject({
      id: 'default',
      value: 'welcome-back',
      label: 'Welcome back',
    });
    expect((testFlags[1] as Flag & { message?: string }).message).toEqual(
      'Rename control variant'
    );
  });

  it('does not prompt for a message when no variant changes are made', async () => {
    textMock.mockResolvedValueOnce('').mockResolvedValueOnce('');

    client.setArgv(
      'flags',
      'update',
      testFlags[1].slug,
      '--variant',
      'control'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(textMock).toHaveBeenCalledTimes(2);
    expect(client.stderr.getFullOutput()).toContain('already up to date');
    expect(
      (testFlags[1] as Flag & { message?: string }).message
    ).toBeUndefined();
  });

  it('errors in non-interactive mode when no updates are provided', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv('flags', 'update', testFlags[1].slug);

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Missing required flag --variant'
    );
  });

  it('errors in non-interactive mode when variant is missing', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'update',
      testFlags[1].slug,
      '--value',
      'welcome-back'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Missing required flag --variant'
    );
  });

  it('errors in non-interactive mode when neither value nor label is provided', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'update',
      testFlags[1].slug,
      '--variant',
      'control'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'At least one of --value or --label must be provided'
    );
  });

  it('updates in non-interactive mode without a message', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'update',
      testFlags[1].slug,
      '--variant',
      'control',
      '--label',
      'Welcome back'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect((testFlags[1] as Flag & { message?: string }).message).toEqual(
      'Updated via CLI'
    );
  });

  it('uses the default message in interactive mode when none is provided', async () => {
    textMock
      .mockResolvedValueOnce('welcome-back')
      .mockResolvedValueOnce('Welcome back')
      .mockResolvedValueOnce('');

    client.setArgv(
      'flags',
      'update',
      testFlags[1].slug,
      '--variant',
      'control'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(textMock.mock.calls[2][0].default).toEqual('Updated via CLI');
    expect((testFlags[1] as Flag & { message?: string }).message).toEqual(
      'Updated via CLI'
    );
  });
});
