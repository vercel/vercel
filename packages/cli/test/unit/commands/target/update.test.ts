import { describe, expect, beforeEach, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import target from '../../../../src/commands/target';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

interface PatchState {
  called: boolean;
  body: Record<string, unknown> | undefined;
  notFound: boolean;
}

function usePatchCustomEnvironment(): PatchState {
  const state: PatchState = { called: false, body: undefined, notFound: false };
  client.scenario.patch(
    '/projects/static/custom-environments/:idOrSlug',
    (req, res) => {
      if (state.notFound) {
        res.status(404).send();
        return;
      }
      state.called = true;
      state.body = req.body;
      res.status(200).json({
        id: 'env_ph1tjPP20xp8VAuiFsYt4rhRYGys',
        slug: req.body.slug ?? req.params.idOrSlug,
        type: 'preview',
        description: req.body.description ?? '',
        branchMatcher: req.body.branchMatcher ?? {
          type: 'startsWith',
          pattern: 'staging',
        },
        domains: [],
        createdAt: 1717176506341,
        updatedAt: 1717176506341,
      });
    }
  );
  return state;
}

describe('target update', () => {
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
      client.setArgv('target', 'update', '--help');
      const exitCodePromise = target(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'target:update',
        },
      ]);
    });
  });

  describe('usage errors', () => {
    it('errors with exit code 2 when no name is passed', async () => {
      client.setArgv('target', 'update');
      const exitCode = await target(client);
      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput('Invalid number of arguments');
    });

    it('errors with exit code 2 when no update flags are provided', async () => {
      const state = usePatchCustomEnvironment();
      client.setArgv('target', 'update', 'staging');
      const exitCode = await target(client);
      expect(exitCode).toEqual(2);
      expect(state.called).toBe(false);
      await expect(client.stderr).toOutput('No changes provided');
    });
  });

  it('rejects a built-in environment name without calling the API', async () => {
    const state = usePatchCustomEnvironment();
    client.setArgv('target', 'update', 'production', '--description', 'x');
    const exitCode = await target(client);
    expect(exitCode).toEqual(1);
    expect(state.called).toBe(false);
    await expect(client.stderr).toOutput('built-in environment');
  });

  it('rejects an incomplete branch matcher pair', async () => {
    const state = usePatchCustomEnvironment();
    client.setArgv(
      'target',
      'update',
      'staging',
      '--branch-matcher-pattern',
      'staging'
    );
    const exitCode = await target(client);
    expect(exitCode).toEqual(1);
    expect(state.called).toBe(false);
    await expect(client.stderr).toOutput('must be provided together');
  });

  it('updates a custom environment and tracks telemetry', async () => {
    const state = usePatchCustomEnvironment();
    client.setArgv(
      'target',
      'update',
      'staging',
      '--slug',
      'preprod',
      '--description',
      'updated',
      '--branch-matcher-type',
      'equals',
      '--branch-matcher-pattern',
      'preprod'
    );
    const exitCode = await target(client);
    expect(exitCode).toEqual(0);

    expect(state.called).toBe(true);
    expect(state.body).toEqual({
      slug: 'preprod',
      description: 'updated',
      branchMatcher: { type: 'equals', pattern: 'preprod' },
    });

    await expect(client.stderr).toOutput('Updated custom environment');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:update',
        value: 'update',
      },
      {
        key: 'argument:name',
        value: '[REDACTED]',
      },
      {
        key: 'option:slug',
        value: '[REDACTED]',
      },
      {
        key: 'option:description',
        value: '[REDACTED]',
      },
      {
        key: 'option:branch-matcher-type',
        value: 'equals',
      },
      {
        key: 'option:branch-matcher-pattern',
        value: '[REDACTED]',
      },
    ]);
  });

  it('sends a sparse body when only one field is updated', async () => {
    const state = usePatchCustomEnvironment();
    client.setArgv('target', 'update', 'staging', '--description', 'only desc');
    const exitCode = await target(client);
    expect(exitCode).toEqual(0);
    expect(state.body).toEqual({ description: 'only desc' });
  });

  it('errors when the custom environment is not found', async () => {
    const state = usePatchCustomEnvironment();
    state.notFound = true;
    client.setArgv('target', 'update', 'missing', '--description', 'x');
    const exitCode = await target(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('was not found');
  });
});
