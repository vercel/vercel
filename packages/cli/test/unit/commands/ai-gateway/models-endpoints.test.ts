import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';

const sampleEndpoint = {
  name: 'anthropic | anthropic/claude-opus-4.8',
  provider_name: 'anthropic',
  model_name: 'Claude Opus 4.8',
  context_length: 1000000,
  pricing: { prompt: '0.000005', completion: '0.000025' },
};

function useModelEndpoints(endpoints: unknown[] = [sampleEndpoint]) {
  client.scenario.get(
    '/v1/models/anthropic/claude-opus-4.8/endpoints',
    (_req, res) => {
      res.json({
        data: { id: 'anthropic/claude-opus-4.8', name: 'Opus', endpoints },
      });
    }
  );
}

describe('ai-gateway models endpoints', () => {
  beforeEach(() => {
    process.env.VERCEL_AI_GATEWAY_URL = client.apiUrl;
  });

  afterEach(() => {
    delete process.env.VERCEL_AI_GATEWAY_URL;
  });

  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'models', 'endpoints', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:models', value: 'models' },
        { key: 'flag:help', value: 'ai-gateway models:endpoints' },
      ]);
    });
  });

  it('errors when no model is provided', async () => {
    useUser();
    client.setArgv('ai-gateway', 'models', 'endpoints');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Specify a model');
    expect(await exitCodePromise).toBe(1);
  });

  it('lists endpoints for a model', async () => {
    useUser();
    useModelEndpoints();
    client.setArgv(
      'ai-gateway',
      'models',
      'endpoints',
      'anthropic/claude-opus-4.8'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('anthropic');
    expect(await exitCodePromise).toBe(0);
  });

  it('falls back to per-second pricing for video models', async () => {
    useUser();
    useModelEndpoints([
      {
        name: 'xai | grok-video',
        provider_name: 'xai',
        pricing: {
          prompt: '0',
          completion: '0',
          video_duration_pricing: [
            { resolution: '480p', cost_per_second: '0.08' },
          ],
        },
      },
    ]);
    client.setArgv(
      'ai-gateway',
      'models',
      'endpoints',
      'anthropic/claude-opus-4.8'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('0.08/s');
    expect(await exitCodePromise).toBe(0);
  });

  it('outputs JSON with --format json', async () => {
    useUser();
    useModelEndpoints();
    client.setArgv(
      'ai-gateway',
      'models',
      'endpoints',
      'anthropic/claude-opus-4.8',
      '--format',
      'json'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"endpoints"');
    expect(await exitCodePromise).toBe(0);
  });

  it('hides throughput and tags from the table', async () => {
    useUser();
    useModelEndpoints([
      {
        name: 'anthropic | anthropic/claude-opus-4.8',
        provider_name: 'anthropic',
        context_length: 1000000,
        pricing: { prompt: '0.000005', completion: '0.000025' },
        throughput_last_1h: { p50: 150 },
        tags: ['reasoning'],
      },
    ]);
    client.setArgv(
      'ai-gateway',
      'models',
      'endpoints',
      'anthropic/claude-opus-4.8'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('anthropic');
    expect(await exitCodePromise).toBe(0);

    const out = client.stdout.getFullOutput();
    expect(out).not.toContain('t/s');
    expect(out).not.toContain('reasoning');
  });

  it('keeps throughput and tags in --format json', async () => {
    useUser();
    useModelEndpoints([
      {
        name: 'anthropic | anthropic/claude-opus-4.8',
        provider_name: 'anthropic',
        pricing: { prompt: '0.000005', completion: '0.000025' },
        throughput_last_1h: { p50: 150 },
        tags: ['reasoning'],
      },
    ]);
    client.setArgv(
      'ai-gateway',
      'models',
      'endpoints',
      'anthropic/claude-opus-4.8',
      '--format',
      'json'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"endpoints"');
    expect(await exitCodePromise).toBe(0);

    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json.endpoints[0].throughput_last_1h.p50).toBe(150);
    expect(json.endpoints[0].tags).toContain('reasoning');
  });
});
