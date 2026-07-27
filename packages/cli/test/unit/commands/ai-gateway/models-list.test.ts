import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

const sampleModel = {
  id: 'anthropic/claude-opus-4.8',
  object: 'model',
  owned_by: 'anthropic',
  name: 'Claude Opus 4.8',
  type: 'language',
};

function useListModels(
  models: unknown[] = [{ ...sampleModel, available: true }],
  availabilityStatus: 'complete' | 'degraded' = 'complete',
  accountAvailability: {
    available: boolean;
    unavailable_reason?: string;
  } = { available: true },
  expectedTeamId?: string
) {
  client.scenario.get('/v1/models', (req, res) => {
    expect(req.query.include_availability).toBe('');
    if (expectedTeamId) {
      expect(req.query.teamId).toBe(expectedTeamId);
    }
    res.json({
      object: 'list',
      data: models,
      availability_status: availabilityStatus,
      ...(accountAvailability && {
        account_availability: accountAvailability,
      }),
    });
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

  it('forwards the selected team to the Gateway catalog', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    useListModels(
      [{ ...sampleModel, available: true }],
      'complete',
      { available: true },
      team.id
    );
    client.setArgv('ai-gateway', 'models', 'list');

    expect(await aiGateway(client)).toBe(0);
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
    const blockedModel = {
      ...sampleModel,
      available: false,
      unavailable_reason: 'account_unavailable',
    };
    useListModels([blockedModel], 'complete', {
      available: false,
      unavailable_reason: 'payment_method_required',
    });
    client.setArgv('ai-gateway', 'models', 'list', '--format', 'json');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"models"');
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      models: [blockedModel],
      availability_status: 'complete',
      account_availability: {
        available: false,
        unavailable_reason: 'payment_method_required',
      },
    });
    expect(await exitCodePromise).toBe(0);
  });

  it('explains a team-wide account blocker on stderr', async () => {
    useUser();
    useListModels(
      [
        {
          ...sampleModel,
          available: false,
          unavailable_reason: 'account_unavailable',
        },
      ],
      'complete',
      {
        available: false,
        unavailable_reason: 'payment_method_required',
      }
    );
    client.setArgv('ai-gateway', 'models', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput(
      'Add a payment method before running models for this team.'
    );
    expect(client.stdout.getFullOutput()).not.toContain('account_unavailable');
    expect(await exitCodePromise).toBe(0);
  });

  it('shows an availability column when the gateway annotates it', async () => {
    useUser();
    useListModels([
      { ...sampleModel, available: true },
      {
        id: 'openai/gpt-5',
        object: 'model',
        owned_by: 'openai',
        name: 'GPT-5',
        type: 'language',
        available: false,
        unavailable_reason: 'no_allowlisted_provider',
      },
    ]);
    client.setArgv('ai-gateway', 'models', 'list');

    const exitCodePromise = aiGateway(client);

    // The rendered reason cell implies the column is present; a model without
    // the field keeps the column hidden (see 'lists models in a table').
    await expect(client.stdout).toOutput('no (no_allowlisted_provider)');
    expect(await exitCodePromise).toBe(0);
  });

  it('warns when availability could not be determined', async () => {
    useUser();
    useListModels([sampleModel], 'degraded');
    client.setArgv('ai-gateway', 'models', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput(
      'Model availability could not be determined'
    );
    expect(await exitCodePromise).toBe(0);
  });

  it('warns when an older Gateway omits availability status', async () => {
    useUser();
    client.scenario.get('/v1/models', (_req, res) => {
      res.json({ object: 'list', data: [sampleModel] });
    });
    client.setArgv('ai-gateway', 'models', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput(
      'Model availability could not be determined'
    );
    expect(await exitCodePromise).toBe(0);
  });

  it('warns when a complete response contains partial annotations', async () => {
    useUser();
    useListModels(
      [
        { ...sampleModel, available: true },
        { ...sampleModel, id: 'partial' },
      ],
      'complete',
      { available: true }
    );
    client.setArgv('ai-gateway', 'models', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput(
      'Model availability could not be determined'
    );
    expect(await exitCodePromise).toBe(0);
  });
});
