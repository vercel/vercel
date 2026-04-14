import { describe, expect, it, beforeEach, vi } from 'vitest';
import flags from '../../../../src/commands/flags';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useFlags } from '../../../mocks/flags';
import type { Flag } from '../../../../src/util/flags/types';

describe('flags create', () => {
  let createdFlags: Flag[];
  const textMock = vi.fn();
  const confirmMock = vi.fn();
  beforeEach(() => {
    createdFlags = [];
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
    });
    useFlags(createdFlags);
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.cwd = cwd;
    client.input.text = textMock;
    client.input.confirm = confirmMock;
    textMock.mockReset();
    confirmMock.mockReset();
    (client.stdin as any).isTTY = true;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'flags';
      const subcommand = 'create';

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

  it('tracks `create` subcommand', async () => {
    client.setArgv('flags', 'create', 'new-feature');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:create',
        value: 'create',
      },
      {
        key: 'argument:slug',
        value: '[REDACTED]',
      },
      {
        key: 'option:kind',
        value: 'boolean',
      },
    ]);
  });

  it('supports `add` as an alias for `create`', async () => {
    client.setArgv('flags', 'add', 'new-feature');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:create',
        value: 'add',
      },
      {
        key: 'argument:slug',
        value: '[REDACTED]',
      },
      {
        key: 'option:kind',
        value: 'boolean',
      },
    ]);
  });

  it('creates a flag successfully', async () => {
    client.setArgv('flags', 'create', 'new-feature');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
  });

  it('prints inspect-style details without timestamps after creating a flag', async () => {
    client.setArgv('flags', 'add', 'new-feature');

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Feature flag new-feature created successfully');
    expect(output).toContain('Feature flag new-feature for');
    expect(output).toContain('Variants:');
    expect(output).toContain('false: Off');
    expect(output).toContain('true: On');
    expect(output).toContain('Environments:');
    expect(output).toContain('production: Off');
    expect(output).toContain('preview: Off');
    expect(output).toContain('development: On');
    expect(output).not.toContain('development: active');
    expect(output).not.toContain('Default: On');
    expect(output).not.toContain('Created:');
    expect(output).not.toContain('Updated:');
  });

  it('matches dash defaults for boolean flags', async () => {
    client.setArgv('flags', 'add', 'new-feature');

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(createdFlags).toHaveLength(1);
    expect(createdFlags[0].environments.production.active).toBe(false);
    expect(createdFlags[0].environments.preview.active).toBe(false);
    expect(createdFlags[0].environments.development.active).toBe(false);
    expect(createdFlags[0].environments.production.pausedOutcome).toMatchObject(
      {
        type: 'variant',
        variantId: createdFlags[0].variants[0].id,
      }
    );
    expect(
      createdFlags[0].environments.development.pausedOutcome
    ).toMatchObject({
      type: 'variant',
      variantId: createdFlags[0].variants[1].id,
    });
    expect(createdFlags[0].environments.development.fallthrough).toMatchObject({
      type: 'variant',
      variantId: createdFlags[0].variants[1].id,
    });
    expect(createdFlags[0].variants).toMatchObject([
      { value: false, label: 'Off', description: 'not enabled' },
      { value: true, label: 'On', description: 'enabled' },
    ]);
  });

  describe('--kind', () => {
    it('tracks `kind` option', async () => {
      client.setArgv(
        'flags',
        'create',
        'new-feature',
        '--kind',
        'string',
        '--variant',
        'control=Control'
      );
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:create',
          value: 'create',
        },
        {
          key: 'argument:slug',
          value: '[REDACTED]',
        },
        {
          key: 'option:kind',
          value: 'string',
        },
      ]);
    });
  });

  describe('--description', () => {
    it('tracks `description` option', async () => {
      client.setArgv(
        'flags',
        'create',
        'new-feature',
        '--description',
        'My feature'
      );
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:create',
          value: 'create',
        },
        {
          key: 'argument:slug',
          value: '[REDACTED]',
        },
        {
          key: 'option:kind',
          value: 'boolean',
        },
        {
          key: 'option:description',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  it('errors without slug argument', async () => {
    client.setArgv('flags', 'create');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
  });

  it('errors with invalid kind', async () => {
    client.setArgv('flags', 'create', 'new-feature', '--kind', 'invalid');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain('Invalid kind');
  });

  it('parses repeatable string variants from flags', async () => {
    client.setArgv(
      'flags',
      'add',
      'welcome-message',
      '--kind',
      'string',
      '--variant',
      'control=Welcome back',
      '--variant',
      'treatment=New onboarding'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(createdFlags[0].variants).toMatchObject([
      { value: 'control', label: 'Welcome back' },
      { value: 'treatment', label: 'New onboarding' },
    ]);
  });

  it('parses number variants from flags', async () => {
    client.setArgv(
      'flags',
      'add',
      'bucket-size',
      '--kind',
      'number',
      '--variant',
      '10=Small',
      '--variant',
      '20=Large'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(createdFlags[0].variants).toMatchObject([
      { value: 10, label: 'Small' },
      { value: 20, label: 'Large' },
    ]);
  });

  it('parses JSON variants from flags and assigns default labels when omitted', async () => {
    client.setArgv(
      'flags',
      'add',
      'layout-config',
      '--kind',
      'json',
      '--variant',
      '{"theme":"light","sidebar":false}=Light',
      '--variant',
      '["dark","compact"]'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(createdFlags[0].variants).toMatchObject([
      {
        value: { theme: 'light', sidebar: false },
        label: 'Light',
      },
      {
        value: ['dark', 'compact'],
        label: 'Variant 2',
      },
    ]);
  });

  it('rejects invalid JSON variants', async () => {
    client.setArgv(
      'flags',
      'add',
      'layout-config',
      '--kind',
      'json',
      '--variant',
      '{"theme":"light"'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'JSON variants must be valid JSON'
    );
  });

  it('collects variants interactively for string flags', async () => {
    textMock
      .mockResolvedValueOnce('control')
      .mockResolvedValueOnce('Welcome back')
      .mockResolvedValueOnce('treatment')
      .mockResolvedValueOnce('New onboarding');
    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    client.setArgv('flags', 'add', 'welcome-message', '--kind', 'string');

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(createdFlags[0].variants).toMatchObject([
      { value: 'control', label: 'Welcome back' },
      { value: 'treatment', label: 'New onboarding' },
    ]);
    expect(confirmMock).toHaveBeenNthCalledWith(
      1,
      'Add another variant?',
      false
    );
    expect(confirmMock).toHaveBeenNthCalledWith(
      2,
      'Add another variant?',
      false
    );
  });

  it('errors in non-interactive mode when string variants are missing', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv('flags', 'add', 'welcome-message', '--kind', 'string');

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Missing required flag --variant'
    );
  });

  it('rejects custom variants for boolean flags', async () => {
    client.setArgv('flags', 'add', 'new-feature', '--variant', 'true=Enabled');

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Boolean flags always use true/false variants'
    );
  });
});
