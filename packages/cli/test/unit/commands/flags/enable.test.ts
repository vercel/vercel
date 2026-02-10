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
          active: false, // Disabled so we can enable it
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
          active: false, // Disabled so we can enable it
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
      slug: 'string-feature',
      description: 'A string feature flag',
      kind: 'string',
      state: 'active',
      variants: [
        { id: 'default', value: 'control', label: 'Control' },
        { id: 'variant-a', value: 'variant-a', label: 'Variant A' },
      ],
      environments: {
        production: {
          active: false,
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
  ];
}

describe('flags enable', () => {
  const selectMock = vi.fn();
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
    selectMock.mockReset();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'flags';
      const subcommand = 'enable';

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

  it('tracks `enable` subcommand', async () => {
    client.setArgv(
      'flags',
      'enable',
      testFlags[0].slug,
      '--environment',
      'production'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:enable',
        value: 'enable',
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

  it('enables a flag successfully', async () => {
    client.setArgv(
      'flags',
      'enable',
      testFlags[0].slug,
      '--environment',
      'production'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain('has been enabled');
  });

  it('errors without flag argument', async () => {
    client.setArgv('flags', 'enable');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
  });

  it('warns when flag is already enabled', async () => {
    // preview environment is already active: true
    client.setArgv(
      'flags',
      'enable',
      testFlags[0].slug,
      '--environment',
      'preview'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain('already enabled');
  });

  it('prompts for environment when not specified', async () => {
    selectMock.mockResolvedValueOnce('production');
    client.setArgv('flags', 'enable', testFlags[0].slug);
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(selectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Select an environment to enable the flag in:',
      })
    );
  });

  it('errors with invalid environment', async () => {
    client.setArgv(
      'flags',
      'enable',
      testFlags[0].slug,
      '--environment',
      'invalid'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain('Invalid environment');
  });

  it('errors when flag is archived', async () => {
    // Set flag to archived (mock uses testFlags reference)
    testFlags[0].state = 'archived';

    client.setArgv(
      'flags',
      'enable',
      testFlags[0].slug,
      '--environment',
      'production'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain('archived');
  });

  it('warns for non-boolean flags with helpful message', async () => {
    // testFlags[1] is a string flag
    client.setArgv(
      'flags',
      'enable',
      testFlags[1].slug,
      '--environment',
      'production'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    const output = client.stderr.getFullOutput();
    // Should show warning about boolean-only
    expect(output).toContain('only works with boolean flags');
    // Should identify the flag type
    expect(output).toContain('string');
    // Should show dashboard link
    expect(output).toContain('https://vercel.com/');
    expect(output).toContain(testFlags[1].slug);
  });
});
