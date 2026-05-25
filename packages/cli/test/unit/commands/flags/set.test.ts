import chalk from 'chalk';
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
          fallthrough: { type: 'variant', variantId: 'on' },
          pausedOutcome: { type: 'variant', variantId: 'on' },
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
        { id: 'default', value: 'control', label: 'Control' },
        { id: 'variant-a', value: 'treatment', label: 'Treatment' },
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
          active: false,
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

describe('flags set', () => {
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
    (client.stdin as any).isTTY = true;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('flags', 'set', '--help');

      const exitCodePromise = flags(client);

      await expect(exitCodePromise).resolves.toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'flags:set',
        },
      ]);
    });
  });

  it('tracks set usage', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'set',
      testFlags[1].slug,
      '--environment',
      'production',
      '--variant',
      'control',
      '--message',
      'Pin production to control'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:set',
        value: 'set',
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
      {
        key: 'option:message',
        value: '[REDACTED]',
      },
    ]);
  });

  it('errors when the flag argument is missing', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv('flags', 'set');

    const exitCodePromise = flags(client);

    await expect(client.stderr).toOutput(
      'Please provide a flag slug or ID to set'
    );
    await expect(client.stderr).toOutput(
      'flags set my-feature --environment production --variant true'
    );
    expect(await exitCodePromise).toEqual(1);
  });

  it('sets a string variant by value', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'set',
      testFlags[1].slug,
      '--environment',
      'production',
      '--variant',
      'treatment'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'Serving variant: "treatment" Treatment'
    );
    expect((testFlags[1] as Flag & { message?: string }).message).toEqual(
      'Set variant for production via CLI'
    );
    expect(testFlags[1].environments.production).toMatchObject({
      active: false,
      pausedOutcome: { type: 'variant', variantId: 'variant-a' },
      fallthrough: { type: 'variant', variantId: 'variant-a' },
    });
  });

  it('sets a number variant by ID', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'set',
      testFlags[2].slug,
      '--environment',
      'preview',
      '--variant',
      'large'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'Serving variant: 20 Large'
    );
    expect(testFlags[2].environments.preview).toMatchObject({
      active: false,
      pausedOutcome: { type: 'variant', variantId: 'large' },
      fallthrough: { type: 'variant', variantId: 'large' },
    });
  });

  it('sets a number variant by value', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'set',
      testFlags[2].slug,
      '--environment',
      'preview',
      '--variant',
      '20'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'Serving variant: 20 Large'
    );
    expect((testFlags[2] as Flag & { message?: string }).message).toEqual(
      'Set variant for preview via CLI'
    );
    expect(testFlags[2].environments.preview).toMatchObject({
      active: false,
      pausedOutcome: { type: 'variant', variantId: 'large' },
      fallthrough: { type: 'variant', variantId: 'large' },
    });
  });

  it('sets a JSON variant by value', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'set',
      testFlags[3].slug,
      '--environment',
      'preview',
      '--variant',
      '["dark","compact"]'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'Serving variant: ["dark","compact"] Dark'
    );
    expect((testFlags[3] as Flag & { message?: string }).message).toEqual(
      'Set variant for preview via CLI'
    );
    expect(testFlags[3].environments.preview).toMatchObject({
      active: false,
      pausedOutcome: { type: 'variant', variantId: 'dark' },
      fallthrough: { type: 'variant', variantId: 'dark' },
    });
  });

  it('sets a flag by ID', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'set',
      testFlags[1].id,
      '--environment',
      'production',
      '--variant',
      'treatment'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'Feature flag welcome-message has been set in production'
    );
    expect(testFlags[1].environments.production).toMatchObject({
      active: false,
      pausedOutcome: { type: 'variant', variantId: 'variant-a' },
      fallthrough: { type: 'variant', variantId: 'variant-a' },
    });
  });

  it('reuses enable behavior for boolean true', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'set',
      testFlags[0].slug,
      '--environment',
      'production',
      '--variant',
      'true'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('has been enabled');
    expect(stripAnsi(output)).toContain('Serving variant: true On');
    expect((testFlags[0] as Flag & { message?: string }).message).toEqual(
      'Enabled for production via CLI'
    );
    expect(testFlags[0].environments.production).toMatchObject({
      active: false,
      pausedOutcome: { type: 'variant', variantId: 'on' },
      fallthrough: { type: 'variant', variantId: 'on' },
    });
  });

  it('reuses disable behavior for boolean false', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'set',
      testFlags[0].slug,
      '--environment',
      'development',
      '--variant',
      'false'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('has been disabled');
    expect(stripAnsi(output)).toContain('Serving variant: false Off');
    expect((testFlags[0] as Flag & { message?: string }).message).toEqual(
      'Disabled for development via CLI'
    );
    expect(testFlags[0].environments.development).toMatchObject({
      active: false,
      pausedOutcome: { type: 'variant', variantId: 'off' },
      fallthrough: { type: 'variant', variantId: 'off' },
    });
  });

  it('prompts for environment and variant when not specified', async () => {
    selectMock
      .mockResolvedValueOnce('preview')
      .mockResolvedValueOnce('variant-a');
    client.setArgv('flags', 'set', testFlags[1].slug);

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(selectMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        message: 'Select an environment to set the variant in:',
      })
    );
    expect(selectMock.mock.calls[0][0].choices).toEqual([
      { name: 'production', value: 'production' },
      { name: 'preview', value: 'preview' },
      { name: 'development', value: 'development' },
    ]);
    expect(selectMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        message: 'Select a variant to serve:',
      })
    );
    expect(textMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Enter a message for this update:',
        default: 'Set variant for preview via CLI',
      })
    );
    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toContain('Environments:');
    expect(output).toContain('production: Control');
    expect(output).toContain('preview: Control');
    expect(output).toContain('development: Control');
    expect(output).not.toContain('production (');
    expect(output).not.toContain('preview (');
    expect(output).not.toContain('development (');
    expect(testFlags[1].environments.preview).toMatchObject({
      active: false,
      pausedOutcome: { type: 'variant', variantId: 'variant-a' },
      fallthrough: { type: 'variant', variantId: 'variant-a' },
    });
  });

  it('errors in non-interactive mode when environment is missing', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv('flags', 'set', testFlags[1].slug, '--variant', 'control');

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Missing required flag --environment'
    );
  });

  it('errors in non-interactive mode when variant is missing', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'set',
      testFlags[1].slug,
      '--environment',
      'production'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Missing required flag --variant'
    );
  });

  it('errors when the environment is invalid', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'set',
      testFlags[1].slug,
      '--environment',
      'staging',
      '--variant',
      'control'
    );

    const exitCodePromise = flags(client);

    await expect(client.stderr).toOutput('Invalid environment: staging');
    expect(await exitCodePromise).toEqual(1);
  });

  it('does not resolve explicit variants by label', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'set',
      testFlags[1].slug,
      '--environment',
      'production',
      '--variant',
      'Treatment'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'You can specify a variant by its ID or value.'
    );
  });

  it('warns when the environment is already serving the selected variant', async () => {
    const originalEnvironment = JSON.parse(
      JSON.stringify(testFlags[1].environments.development)
    );
    const originalMessage = (testFlags[1] as Flag & { message?: string })
      .message;
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'set',
      testFlags[1].slug,
      '--environment',
      'development',
      '--variant',
      'control'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'already serving "control" Control in development'
    );
    expect(testFlags[1].environments.development).toEqual(originalEnvironment);
    expect((testFlags[1] as Flag & { message?: string }).message).toEqual(
      originalMessage
    );
  });

  it('errors when the flag is archived', async () => {
    testFlags[1].state = 'archived';
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'set',
      testFlags[1].slug,
      '--environment',
      'production',
      '--variant',
      'control'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain('archived');
  });

  it('uses a custom revision message', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'set',
      testFlags[2].slug,
      '--environment',
      'production',
      '--variant',
      'large',
      '--message',
      'Pin production bucket size'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect((testFlags[2] as Flag & { message?: string }).message).toEqual(
      'Pin production bucket size'
    );
  });

  it('errors when the project is not linked', async () => {
    const cwd = setupUnitFixture('vercel-pull-unlinked');
    client.cwd = cwd;
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'set',
      testFlags[1].slug,
      '--environment',
      'production',
      '--variant',
      'control'
    );

    const exitCodePromise = flags(client);

    await expect(client.stderr).toOutput(
      "Your codebase isn't linked to a project on Vercel"
    );
    expect(await exitCodePromise).toEqual(1);
  });

  it('falls back to the default revision message when interactive input is blank', async () => {
    selectMock
      .mockResolvedValueOnce('preview')
      .mockResolvedValueOnce('variant-a');
    textMock.mockResolvedValueOnce('   ');
    client.setArgv('flags', 'set', testFlags[1].slug);

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect((testFlags[1] as Flag & { message?: string }).message).toEqual(
      'Set variant for preview via CLI'
    );
  });

  it('shows variant labels in interactive prompts while returning IDs', async () => {
    selectMock
      .mockResolvedValueOnce('preview')
      .mockResolvedValueOnce('variant-a');
    client.setArgv('flags', 'set', testFlags[1].slug);

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const variantChoices = selectMock.mock.calls[1][0].choices;
    expect(variantChoices).toEqual([
      {
        value: 'default',
        name: '"control" Control',
      },
      {
        value: 'variant-a',
        name: '"treatment" Treatment',
      },
    ]);
    expect(client.stderr.getFullOutput()).toContain(chalk.dim('Treatment'));
  });
});
