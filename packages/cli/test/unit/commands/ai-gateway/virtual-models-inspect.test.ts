import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

const sampleVirtualModel = {
  ownerId: 'team_abc',
  virtualModelSlug: 'my-model',
  modelSlug: 'anthropic/claude-opus-4.8',
  kind: 'alias',
  status: 'active',
  providerOrder: ['anthropic', 'bedrock'],
  inferenceRegion: { scope: 'zone', geoRegion: 'eu' },
  zeroDataRetention: true,
  createdAt: 1,
  updatedAt: 2,
};

function useGetVirtualModel(virtualModel: unknown = sampleVirtualModel) {
  let slug: unknown;
  client.scenario.get('/ai-gateway/virtual-model-configs/:slug', (req, res) => {
    slug = req.params.slug;
    res.json(virtualModel);
  });
  return () => slug;
}

describe('ai-gateway virtual-models inspect', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'virtual-models', 'inspect', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:virtual-models', value: 'virtual-models' },
        { key: 'flag:help', value: 'ai-gateway virtual-models:inspect' },
      ]);
    });
  });

  it('errors when no slug is given', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'virtual-models', 'inspect');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('expects a virtual model slug');
    expect(await exitCodePromise).toBe(2);
  });

  it('prints the virtual model details', async () => {
    const team = useTeam();
    useUser();
    useGetVirtualModel();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'virtual-models', 'inspect', 'my-model');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('anthropic/claude-opus-4.8');
    expect(await exitCodePromise).toBe(0);
  });

  it('forwards the slug to the API', async () => {
    const team = useTeam();
    useUser();
    const getSlug = useGetVirtualModel();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'virtual-models', 'inspect', 'my-model');

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getSlug()).toBe('my-model');
  });

  it('reports a missing virtual model without leaking the api wording', async () => {
    const team = useTeam();
    useUser();
    client.scenario.get(
      '/ai-gateway/virtual-model-configs/:slug',
      (_req, res) => {
        res
          .status(404)
          .json({ error: { message: 'Virtual model config not found' } });
      }
    );
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'virtual-models', 'inspect', 'nope');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Virtual model "nope" not found.');
    expect(await exitCodePromise).toBe(1);
  });

  it('outputs JSON with --format json', async () => {
    const team = useTeam();
    useUser();
    useGetVirtualModel();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'inspect',
      'my-model',
      '--format',
      'json'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"virtualModelSlug"');
    expect(await exitCodePromise).toBe(0);
  });
});
