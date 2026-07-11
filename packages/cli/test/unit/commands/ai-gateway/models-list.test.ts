import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';

const sampleModel = {
  id: 'anthropic/claude-opus-4.8',
  object: 'model',
  owned_by: 'anthropic',
  name: 'Claude Opus 4.8',
  type: 'language',
};

function useListModels(models: unknown[] = [sampleModel]) {
  client.scenario.get('/v1/models', (_req, res) => {
    res.json({ object: 'list', data: models });
  });
}

describe('ai-gateway models list', () => {
  beforeEach(() => {
    // Route the public AI Gateway host through the mock server.
    process.env.VERCEL_AI_GATEWAY_URL = client.apiUrl;
  });

  afterEach(() => {
    delete process.env.VERCEL_AI_GATEWAY_URL;
  });

  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'models', 'list', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:models', value: 'models' },
        { key: 'flag:help', value: 'ai-gateway models:list' },
      ]);
    });
  });

  it('lists models in a table', async () => {
    useUser();
    useListModels();
    client.setArgv('ai-gateway', 'models', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('anthropic/claude-opus-4.8');
    expect(await exitCodePromise).toBe(0);
  });

  it('reports when there are no models', async () => {
    useUser();
    useListModels([]);
    client.setArgv('ai-gateway', 'models', 'ls');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('No models found');
    expect(await exitCodePromise).toBe(0);
  });

  it('outputs JSON with --format json', async () => {
    useUser();
    useListModels();
    client.setArgv('ai-gateway', 'models', 'list', '--format', 'json');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"models"');
    expect(await exitCodePromise).toBe(0);
  });
});
