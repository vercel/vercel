import { describe, expect, beforeEach, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import target from '../../../../src/commands/target';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

interface PostState {
  called: boolean;
  body: Record<string, unknown> | undefined;
}

function useCreateCustomEnvironment(): PostState {
  const state: PostState = { called: false, body: undefined };
  client.scenario.post('/projects/static/custom-environments', (req, res) => {
    state.called = true;
    state.body = req.body;
    res.status(201).json({
      id: 'env_new123',
      slug: req.body.slug,
      type: 'preview',
      description: req.body.description ?? '',
      branchMatcher: req.body.branchMatcher,
      domains: [],
      createdAt: 1717176506341,
      updatedAt: 1717176506341,
    });
  });
  return state;
}

describe('target add', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'static',
      id: 'static',
      accountId: 'team_dummy',
    });
    client.cwd = setupUnitFixture('commands/deploy/static');
    client.stderr.isTTY = false;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('target', 'add', '--help');
      const exitCodePromise = target(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'target:add',
        },
      ]);
    });
  });

  describe('usage errors', () => {
    it('errors with exit code 2 when no name is passed', async () => {
      client.setArgv('target', 'add');
      const exitCode = await target(client);
      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput('Invalid number of arguments');
    });

    it('errors with exit code 2 when too many arguments are passed', async () => {
      client.setArgv('target', 'add', 'one', 'two');
      const exitCode = await target(client);
      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput('Invalid number of arguments');
    });
  });

  it('rejects a built-in environment name without calling the API', async () => {
    const state = useCreateCustomEnvironment();
    client.setArgv('target', 'add', 'production');
    const exitCode = await target(client);
    expect(exitCode).toEqual(1);
    expect(state.called).toBe(false);
    await expect(client.stderr).toOutput('built-in environment');
  });

  it('rejects an incomplete branch matcher pair', async () => {
    const state = useCreateCustomEnvironment();
    client.setArgv(
      'target',
      'add',
      'staging',
      '--branch-matcher-type',
      'equals'
    );
    const exitCode = await target(client);
    expect(exitCode).toEqual(1);
    expect(state.called).toBe(false);
    await expect(client.stderr).toOutput('must be provided together');
  });

  it('rejects an invalid branch matcher type', async () => {
    const state = useCreateCustomEnvironment();
    client.setArgv(
      'target',
      'add',
      'staging',
      '--branch-matcher-type',
      'contains',
      '--branch-matcher-pattern',
      'staging'
    );
    const exitCode = await target(client);
    expect(exitCode).toEqual(1);
    expect(state.called).toBe(false);
    await expect(client.stderr).toOutput('Invalid --branch-matcher-type');
  });

  it('creates a custom environment and tracks telemetry', async () => {
    const state = useCreateCustomEnvironment();
    client.setArgv(
      'target',
      'add',
      'staging',
      '--description',
      'staging env',
      '--branch-matcher-type',
      'startsWith',
      '--branch-matcher-pattern',
      'staging',
      '--copy-env-vars-from',
      'production'
    );
    const exitCode = await target(client);
    expect(exitCode).toEqual(0);

    expect(state.called).toBe(true);
    expect(state.body).toEqual({
      slug: 'staging',
      description: 'staging env',
      branchMatcher: { type: 'startsWith', pattern: 'staging' },
      copyEnvVarsFrom: 'production',
    });

    await expect(client.stderr).toOutput('Added custom environment');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:add',
        value: 'add',
      },
      {
        key: 'argument:name',
        value: '[REDACTED]',
      },
      {
        key: 'option:description',
        value: '[REDACTED]',
      },
      {
        key: 'option:branch-matcher-type',
        value: 'startsWith',
      },
      {
        key: 'option:branch-matcher-pattern',
        value: '[REDACTED]',
      },
      {
        key: 'option:copy-env-vars-from',
        value: '[REDACTED]',
      },
    ]);
  });

  it('creates a custom environment with only a name', async () => {
    const state = useCreateCustomEnvironment();
    client.setArgv('target', 'add', 'staging');
    const exitCode = await target(client);
    expect(exitCode).toEqual(0);
    expect(state.body).toEqual({ slug: 'staging' });
  });
});
