import { describe, it, expect, beforeEach } from 'vitest';
import flags from '../../../../src/commands/flags';
import {
  removeProjectLink,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useFlags, defaultFlags } from '../../../mocks/flags';
import type { Flag, FlagKind } from '../../../../src/util/flags/types';

describe('flags inspect', () => {
  let flagsList: Flag[];
  let denyFlagAccess: boolean;
  let settingsRequests: number;

  beforeEach(() => {
    flagsList = JSON.parse(JSON.stringify(defaultFlags)) as Flag[];
    denyFlagAccess = false;
    settingsRequests = 0;
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
      accountId: 'team_dummy',
    });
    client.scenario.get(
      '/v1/projects/:projectId/feature-flags/flags/:flagIdOrSlug',
      (_req, res, next) => {
        if (denyFlagAccess) {
          res.status(403).json({ error: { message: 'Access denied' } });
        } else {
          next?.();
        }
      }
    );
    client.scenario.get(
      '/v1/projects/:projectId/feature-flags/settings',
      (_req, _res, next) => {
        settingsRequests++;
        next?.();
      }
    );
    useFlags(flagsList);
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.cwd = cwd;
  });

  it('tracks `inspect` subcommand', async () => {
    client.setArgv('flags', 'inspect', 'my-feature');
    await flags(client);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:inspect',
        value: 'inspect',
      },
      {
        key: 'argument:flag',
        value: '[REDACTED]',
      },
    ]);
  });

  it.each([
    undefined,
    0,
    33_333,
    50_000,
    100_000,
  ])('displays rollout finalPromille %s in default and rule outcomes', async finalPromille => {
    const outcome = {
      type: 'rollout' as const,
      base: { type: 'entity' as const, kind: 'user', attribute: 'userId' },
      startTimestamp: 1_700_000_000_000,
      rollFromVariantId: 'off',
      rollToVariantId: 'on',
      defaultVariantId: 'off',
      slots: [{ promille: 5000, durationMs: 3_600_000 }],
      ...(finalPromille !== undefined && { finalPromille }),
    };
    flagsList[0].environments.production.fallthrough = outcome;
    flagsList[0].environments.production.rules = [
      { id: 'rollout', conditions: [], outcome },
    ];
    client.setArgv('flags', 'inspect', flagsList[0].slug);
    expect(await flags(client)).toBe(0);
    const output = client.stderr.getFullOutput();
    const endpoint = `then ${(finalPromille ?? 100_000) / 1000}%;`;
    expect(output.split(endpoint)).toHaveLength(3);
  });

  it('shows flag details', async () => {
    client.setArgv('flags', 'inspect', defaultFlags[0].slug);
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Created:');
    expect(output).toContain('Updated:');
    expect(output).toContain('false: Off');
    expect(output).toContain('id: off');
    expect(output).toContain('true: On');
    expect(output).toContain('id: on');
    expect(output).toContain('production: custom');
    expect(output).toContain('preview: On');
    expect(output).toContain('development: On');
    expect(output).not.toContain('production: active');
    expect(client.stdout.getFullOutput()).toBe('');
  });

  describe('--json', () => {
    it.each([
      { kind: 'boolean', value: false },
      { kind: 'string', value: 'control' },
      { kind: 'number', value: 0 },
      { kind: 'json', value: { theme: 'light', sizes: [1, 2], extra: null } },
    ])('preserves $kind values and environment configuration', async ({
      kind,
      value,
    }) => {
      flagsList[0].kind = kind as FlagKind;
      flagsList[0].variants[0].value = value;
      flagsList[0].environments.preview.active = false;
      client.setArgv('flags', 'inspect', flagsList[0].slug, '--json');

      expect(await flags(client)).toBe(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
        flag: flagsList[0],
      });
      expect(client.stderr.getFullOutput()).not.toContain('Created:');
      expect(settingsRequests).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:inspect', value: 'inspect' },
        { key: 'argument:flag', value: '[REDACTED]' },
        { key: 'flag:json', value: 'TRUE' },
      ]);
    });

    it('supports flag IDs and an explicit project without a local link', async () => {
      removeProjectLink(client.cwd);
      client.nonInteractive = true;
      client.setArgv(
        'flags',
        'inspect',
        flagsList[0].id,
        '--project',
        'vercel-flags-test',
        '--json'
      );

      expect(await flags(client)).toBe(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
        flag: flagsList[0],
      });
    });

    it.each([
      { args: [], message: 'Missing required argument', exitCode: 2 },
      { args: ['nonexistent-flag'], message: 'Flag not found', exitCode: 1 },
    ])('leaves stdout empty on $message', async ({
      args,
      message,
      exitCode,
    }) => {
      client.setArgv('flags', 'inspect', ...args, '--json');

      expect(await flags(client)).toBe(exitCode);
      expect(client.stdout.getFullOutput()).toBe('');
      expect(client.stderr.getFullOutput()).toContain(message);
    });

    it('leaves stdout empty when access is denied', async () => {
      denyFlagAccess = true;
      client.setArgv('flags', 'inspect', flagsList[0].slug, '--json');

      expect(await flags(client)).toBe(1);
      expect(client.stdout.getFullOutput()).toBe('');
      expect(client.stderr.getFullOutput()).toContain('Access denied');
    });
  });

  it('shows flag details with --project when the cwd is not linked', async () => {
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    removeProjectLink(cwd);
    client.cwd = cwd;

    client.setArgv(
      'flags',
      'inspect',
      defaultFlags[0].slug,
      '--project',
      'vercel-flags-test'
    );
    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain('Kind:         boolean');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:inspect', value: 'inspect' },
      { key: 'argument:flag', value: '[REDACTED]' },
      { key: 'option:project', value: '[REDACTED]' },
    ]);
  });

  it('shows the served value for simple environments', async () => {
    client.setArgv('flags', 'inspect', defaultFlags[1].slug);
    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain('production: Control');
  });

  it('shows experiment management and experiment assignment outcomes', async () => {
    flagsList[0].experiment = {
      id: 'exp_checkout',
      base: { type: 'entity', kind: 'user', attribute: 'id' },
      weights: { off: 50, on: 50 },
      controlVariantId: 'off',
      enrollmentSeed: 123,
      rampId: 'rmp_current',
      rampPercentage: 25,
    };
    flagsList[0].environments.production.fallthrough = {
      type: 'experiment',
    };
    client.setArgv('flags', 'inspect', flagsList[0].slug);

    expect(await flags(client)).toBe(0);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('managed by exp_checkout');
    expect(stderr).toContain('experiment assignment');
    expect(stderr).not.toContain('Fallback:');
  });

  it('shows experiment management when experiment details are omitted', async () => {
    flagsList[0].experiment = {
      base: { type: 'entity', kind: 'user', attribute: 'id' },
    };
    client.setArgv('flags', 'inspect', flagsList[0].slug);

    expect(await flags(client)).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('managed by an experiment');
  });

  it('shows the served paused value for inactive environments', async () => {
    flagsList[1].environments.production.active = false;
    client.setArgv('flags', 'inspect', flagsList[1].slug);
    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain('production: Control');
  });

  it('shows JSON flag details', async () => {
    flagsList.push({
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
          active: false,
          fallthrough: { type: 'variant', variantId: 'light' },
          pausedOutcome: { type: 'variant', variantId: 'dark' },
          rules: [],
        },
        development: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'dark' },
          pausedOutcome: { type: 'variant', variantId: 'light' },
          rules: [],
        },
      },
      createdAt: Date.now() - 172800000,
      updatedAt: Date.now() - 7200000,
      createdBy: 'user_123',
      projectId: 'vercel-flags-test',
      ownerId: 'team_dummy',
      revision: 1,
      seed: 67890,
      typeName: 'flag',
    });

    client.setArgv('flags', 'inspect', 'layout-config');
    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Kind:         json');
    expect(output).toContain('{"theme":"light","sidebar":false}:');
    expect(output).toContain('["dark","compact"]:');
    expect(output).toContain('production: Light');
    expect(output).toContain('preview: Dark');
  });

  it('returns error when flag argument is missing', async () => {
    client.setArgv('flags', 'inspect');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(2);
  });

  it('returns error when flag is not found', async () => {
    client.setArgv('flags', 'inspect', 'nonexistent-flag');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain('Flag not found');
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'flags';
      const subcommand = 'inspect';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = flags(client);
      await expect(exitCodePromise).resolves.toEqual(0);
      expect(client.stderr.getFullOutput()).toContain('--json');
      expect(client.stderr.getFullOutput()).toContain(
        'flags inspect my-feature-flag --json'
      );

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });
});
