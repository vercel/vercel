import { describe, expect, beforeEach, afterEach, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import target from '../../../../src/commands/target';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

interface DeleteState {
  called: boolean;
  body: Record<string, unknown> | undefined;
}

function useDeleteCustomEnvironment(): DeleteState {
  const state: DeleteState = { called: false, body: undefined };
  client.scenario.delete(
    '/projects/static/custom-environments/:idOrSlug',
    (req, res) => {
      state.called = true;
      state.body = req.body;
      res.status(200).json({
        id: 'env_ph1tjPP20xp8VAuiFsYt4rhRYGys',
        slug: req.params.idOrSlug,
        type: 'preview',
        description: '',
        domains: [],
        createdAt: 1717176506341,
        updatedAt: 1717176506341,
      });
    }
  );
  return state;
}

describe('target remove', () => {
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

  afterEach(() => {
    client.nonInteractive = false;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('target', 'remove', '--help');
      const exitCodePromise = target(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'target:remove',
        },
      ]);
    });
  });

  describe('usage errors', () => {
    it('errors with exit code 2 when no name is passed', async () => {
      client.setArgv('target', 'remove');
      const exitCode = await target(client);
      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput('Invalid number of arguments');
    });
  });

  it('rejects a built-in environment name without calling the API', async () => {
    const state = useDeleteCustomEnvironment();
    client.setArgv('target', 'remove', 'production', '--yes');
    const exitCode = await target(client);
    expect(exitCode).toEqual(1);
    expect(state.called).toBe(false);
    await expect(client.stderr).toOutput('built-in environment');
  });

  it('removes a custom environment with --yes and tracks telemetry', async () => {
    const state = useDeleteCustomEnvironment();
    client.setArgv('target', 'remove', 'staging', '--yes');
    const exitCode = await target(client);
    expect(exitCode).toEqual(0);
    expect(state.called).toBe(true);

    await expect(client.stderr).toOutput('Removed custom environment');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:remove',
        value: 'remove',
      },
      {
        key: 'argument:name',
        value: '[REDACTED]',
      },
      {
        key: 'flag:yes',
        value: 'TRUE',
      },
    ]);
  });

  it('tracks the rm alias as subcommand:remove', async () => {
    useDeleteCustomEnvironment();
    client.setArgv('target', 'rm', 'staging', '--yes');
    const exitCode = await target(client);
    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:remove',
        value: 'rm',
      },
      {
        key: 'argument:name',
        value: '[REDACTED]',
      },
      {
        key: 'flag:yes',
        value: 'TRUE',
      },
    ]);
  });

  it('sends deleteUnassignedEnvironmentVariables when the flag is set', async () => {
    const state = useDeleteCustomEnvironment();
    client.setArgv(
      'target',
      'remove',
      'staging',
      '--delete-unassigned-env-vars',
      '--yes'
    );
    const exitCode = await target(client);
    expect(exitCode).toEqual(0);
    expect(state.body).toEqual({ deleteUnassignedEnvironmentVariables: true });
  });

  it('asks for confirmation and removes when accepted', async () => {
    const state = useDeleteCustomEnvironment();
    const confirmMock = vi.fn().mockResolvedValue(true);
    client.input.confirm = confirmMock;
    client.setArgv('target', 'remove', 'staging');
    const exitCode = await target(client);
    expect(exitCode).toEqual(0);
    expect(confirmMock).toHaveBeenCalled();
    expect(state.called).toBe(true);
  });

  it('does not call the API when the confirmation is declined', async () => {
    const state = useDeleteCustomEnvironment();
    const confirmMock = vi.fn().mockResolvedValue(false);
    client.input.confirm = confirmMock;
    client.setArgv('target', 'remove', 'staging');
    const exitCode = await target(client);
    expect(exitCode).toEqual(0);
    expect(confirmMock).toHaveBeenCalled();
    expect(state.called).toBe(false);
    await expect(client.stderr).toOutput('Canceled');
  });

  it('outputs confirmation_required and does not call the API in non-interactive mode', async () => {
    const state = useDeleteCustomEnvironment();
    client.nonInteractive = true;

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: number) => {
        throw new Error(`process.exit(${code})`);
      });

    client.setArgv('target', 'remove', 'staging', '--non-interactive');

    await expect(target(client)).rejects.toThrow('process.exit(1)');

    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.status).toBe('action_required');
    expect(payload.reason).toBe('confirmation_required');
    expect(payload.next[0].command).toContain('--yes');
    expect(state.called).toBe(false);

    exitSpy.mockRestore();
  });
});
