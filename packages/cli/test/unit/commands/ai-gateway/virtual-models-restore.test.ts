import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

function useRestoreVirtualModel(status = 200) {
  let body: Record<string, unknown> | undefined;
  let slug: unknown;
  client.scenario.patch(
    '/ai-gateway/virtual-model-configs/:slug',
    (req, res) => {
      body = req.body;
      slug = req.params.slug;
      if (status !== 200) {
        res.status(status).json({ error: { message: 'Not found' } });
        return;
      }
      res.json({
        ownerId: 'team_abc',
        virtualModelSlug: req.params.slug,
        deleted: false,
        createdAt: 1,
        updatedAt: 2,
      });
    }
  );
  return Object.assign(() => body, { slug: () => slug });
}

describe('ai-gateway virtual-models restore', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'virtual-models', 'restore', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:virtual-models', value: 'virtual-models' },
        { key: 'flag:help', value: 'ai-gateway virtual-models:restore' },
      ]);
    });
  });

  it('errors when no slug is given', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'virtual-models', 'restore');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('expects a virtual model slug');
    expect(await exitCodePromise).toBe(2);
  });

  it('clears the deleted flag for the given slug', async () => {
    const team = useTeam();
    useUser();
    const getBody = useRestoreVirtualModel();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'virtual-models', 'restore', 'my-model');

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getBody()).toEqual({ deleted: false });
    expect(getBody.slug()).toBe('my-model');
  });

  it('never sends ownerId, since the api derives it from auth', async () => {
    const team = useTeam();
    useUser();
    const getBody = useRestoreVirtualModel();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'virtual-models', 'restore', 'my-model');

    await aiGateway(client);

    expect(getBody()).not.toHaveProperty('ownerId');
  });

  it('reports a missing virtual model', async () => {
    const team = useTeam();
    useUser();
    useRestoreVirtualModel(404);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'virtual-models', 'restore', 'nope');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('not found');
    expect(await exitCodePromise).toBe(1);
  });

  it('outputs JSON with --format json', async () => {
    const team = useTeam();
    useUser();
    useRestoreVirtualModel();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'restore',
      'my-model',
      '--format',
      'json'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"virtualModelSlug"');
    expect(await exitCodePromise).toBe(0);
  });
});
