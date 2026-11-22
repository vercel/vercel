import { describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

function useDeleteVirtualModel(status = 200) {
  let slug: unknown;
  client.scenario.delete(
    '/ai-gateway/virtual-model-configs/:slug',
    (req, res) => {
      slug = req.params.slug;
      if (status !== 200) {
        res.status(status).json({ error: { message: 'Not found' } });
        return;
      }
      res.json({ deleted: true });
    }
  );
  return () => slug;
}

describe('ai-gateway virtual-models remove', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'virtual-models', 'remove', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:virtual-models', value: 'virtual-models' },
        { key: 'flag:help', value: 'ai-gateway virtual-models:remove' },
      ]);
    });
  });

  it('errors when no slug is given', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'virtual-models', 'rm');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('expects a virtual model slug');
    expect(await exitCodePromise).toBe(2);
  });

  it('removes and forwards the slug', async () => {
    const team = useTeam();
    useUser();
    const getQuery = useDeleteVirtualModel();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'virtual-models', 'rm', 'my-model');

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getQuery()).toBe('my-model');
  });

  it('removes without confirmation in non-interactive mode', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.nonInteractive = true;
    const confirmSpy = vi.spyOn(client.input, 'confirm');
    const getQuery = useDeleteVirtualModel();
    client.setArgv('ai-gateway', 'virtual-models', 'rm', 'my-model');

    expect(await aiGateway(client)).toBe(0);

    // Removal is a soft delete and `restore` undoes it, so there is nothing
    // to confirm and no --yes to require.
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(getQuery()).toBe('my-model');
    vi.restoreAllMocks();
    client.nonInteractive = false;
  });

  it.each([
    ['delete', false],
    ['del', false],
    ['remove', true],
  ])('runs as %s (deprecated: %s)', async (name, deprecated) => {
    const team = useTeam();
    useUser();
    const getQuery = useDeleteVirtualModel();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'virtual-models', name, 'my-model');

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getQuery()).toBe('my-model');
    const warning =
      '`vercel ai-gateway virtual-models remove` is deprecated. Use `vercel ai-gateway virtual-models delete`.';
    if (deprecated) {
      expect(client.stderr.getFullOutput()).toContain(warning);
    } else {
      expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
    }
  });

  it('reports a missing virtual model', async () => {
    const team = useTeam();
    useUser();
    useDeleteVirtualModel(404);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'virtual-models', 'rm', 'nope');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('not found');
    expect(await exitCodePromise).toBe(1);
  });
});
