import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

function useEditVirtualModel() {
  let body: Record<string, unknown> | undefined;
  let slug: unknown;
  client.scenario.patch(
    '/ai-gateway/virtual-model-configs/:slug',
    (req, res) => {
      body = req.body;
      slug = req.params.slug;
      res.json({
        ownerId: 'team_abc',
        virtualModelSlug: req.params.slug,
        createdAt: 1,
        updatedAt: 2,
      });
    }
  );
  return Object.assign(() => body, { slug: () => slug });
}

describe('ai-gateway virtual-models edit', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'virtual-models', 'edit', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:virtual-models', value: 'virtual-models' },
        { key: 'flag:help', value: 'ai-gateway virtual-models:edit' },
      ]);
    });
  });

  it('errors when no slug is given', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'virtual-models', 'edit');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('expects a virtual model slug');
    expect(await exitCodePromise).toBe(2);
  });

  it('errors when no fields are provided', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'virtual-models', 'edit', 'my-model');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('at least one field to change');
    expect(await exitCodePromise).toBe(2);
  });

  it('sends only the changed field, with the slug in the path', async () => {
    const team = useTeam();
    useUser();
    const getBodyWithSlug = useEditVirtualModel();
    const getBody = () => getBodyWithSlug();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'edit',
      'my-model',
      '--display-name',
      'Renamed'
    );

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getBody()).toEqual({ displayName: 'Renamed' });
    expect(getBodyWithSlug.slug()).toBe('my-model');
  });

  it('takes fields with no flag from --config', async () => {
    const team = useTeam();
    useUser();
    const getBody = useEditVirtualModel();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'edit',
      'my-model',
      '--config',
      '{"serviceTier":"flex"}'
    );

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getBody()).toMatchObject({ serviceTier: 'flex' });
  });

  it('ignores a slug set inside --config in favour of the argument', async () => {
    const team = useTeam();
    useUser();
    const getBodyWithSlug = useEditVirtualModel();
    const getBody = () => getBodyWithSlug();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'edit',
      'my-model',
      '--config',
      '{"virtualModelSlug":"other-model","serviceTier":"flex"}'
    );

    await aiGateway(client);

    expect(getBody()).toMatchObject({ serviceTier: 'flex' });
    expect(getBody()).not.toHaveProperty('virtualModelSlug');
    expect(getBodyWithSlug.slug()).toBe('my-model');
  });

  it('rejects kind in --config since the update schema has no kind', async () => {
    const team = useTeam();
    useUser();
    const getBody = useEditVirtualModel();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'edit',
      'my-model',
      '--config',
      '{"kind":"relay"}'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Unknown field: kind');
    expect(await exitCodePromise).toBe(1);
    expect(getBody()).toBeUndefined();
  });

  describe('subcommand name', () => {
    function useModelUpdate() {
      const team = useTeam();
      useUser();
      useEditVirtualModel();
      client.config.currentTeam = team.id;
    }

    it('warns when invoked as the deprecated edit name', async () => {
      useModelUpdate();
      client.setArgv(
        'ai-gateway',
        'virtual-models',
        'edit',
        'my-model',
        '--display-name',
        'Renamed'
      );

      expect(await aiGateway(client)).toBe(0);
      await expect(client.stderr).toOutput(
        '`vercel ai-gateway virtual-models edit` is deprecated. Use `vercel ai-gateway virtual-models update`.'
      );
    });

    it('does not warn when invoked as update', async () => {
      useModelUpdate();
      client.setArgv(
        'ai-gateway',
        'virtual-models',
        'update',
        'my-model',
        '--display-name',
        'Renamed'
      );

      expect(await aiGateway(client)).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
    });
  });
});
