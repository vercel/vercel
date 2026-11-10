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
      expect(exitCode).toBe(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:models', value: 'models' },
        { key: 'flag:help', value: 'ai-gateway models:list' },
      ]);
    });
  });

  it('merges team virtual models when a team is selected', async () => {
    useUser();
    const team = useTeam();
    useListModels();
    client.config.currentTeam = team.id;
    client.scenario.get(
      '/ai-gateway/virtual-model-configs/list',
      (_req, res) => {
        res.json({
          virtualModelConfigs: [
            {
              virtualModelSlug: 'support-chat',
              displayName: 'Support Chat',
              ownerId: 'team_abc',
              createdAt: 1,
              updatedAt: 2,
            },
          ],
          cursor: null,
        });
      }
    );
    client.setArgv('ai-gateway', 'models', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('vmc/support-chat');
    expect(await exitCodePromise).toBe(0);
    client.config.currentTeam = undefined;
  });

  it('shows only virtual models with --virtual', async () => {
    useUser();
    const team = useTeam();
    useListModels();
    client.config.currentTeam = team.id;
    client.scenario.get(
      '/ai-gateway/virtual-model-configs/list',
      (_req, res) => {
        res.json({
          virtualModelConfigs: [
            {
              virtualModelSlug: 'support-chat',
              ownerId: 'team_abc',
              createdAt: 1,
              updatedAt: 2,
            },
          ],
          cursor: null,
        });
      }
    );
    client.setArgv('ai-gateway', 'models', 'list', '--virtual');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('vmc/support-chat');
    expect(await exitCodePromise).toBe(0);
    client.config.currentTeam = undefined;
  });

  it('surfaces a failing virtual fetch in --virtual mode', async () => {
    useUser();
    const team = useTeam();
    useListModels();
    client.config.currentTeam = team.id;
    client.scenario.get(
      '/ai-gateway/virtual-model-configs/list',
      (_req, res) => {
        res.status(500).json({ error: { message: 'boom' } });
      }
    );
    client.setArgv('ai-gateway', 'models', 'list', '--virtual');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('boom');
    expect(await exitCodePromise).toBe(1);
    client.config.currentTeam = undefined;
  });

  it('walks every virtual model page in --virtual mode', async () => {
    useUser();
    const team = useTeam();
    useListModels();
    client.config.currentTeam = team.id;
    const cursors: (string | undefined)[] = [];
    client.scenario.get(
      '/ai-gateway/virtual-model-configs/list',
      (req, res) => {
        const cursor = req.query.cursor as string | undefined;
        cursors.push(cursor);
        res.json(
          cursor
            ? {
                virtualModelConfigs: [
                  {
                    virtualModelSlug: 'second-page-model',
                    ownerId: 'team_abc',
                    createdAt: 1,
                    updatedAt: 2,
                  },
                ],
                cursor: null,
              }
            : {
                virtualModelConfigs: [
                  {
                    virtualModelSlug: 'support-chat',
                    ownerId: 'team_abc',
                    createdAt: 1,
                    updatedAt: 2,
                  },
                ],
                cursor: 'page-2',
              }
        );
      }
    );
    client.setArgv('ai-gateway', 'models', 'list', '--virtual');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('vmc/second-page-model');
    expect(await exitCodePromise).toBe(0);
    expect(cursors).toEqual([undefined, 'page-2']);
    client.config.currentTeam = undefined;
  });

  it('fails in --virtual mode when virtual model paging repeats a cursor', async () => {
    useUser();
    const team = useTeam();
    useListModels();
    client.config.currentTeam = team.id;
    client.scenario.get(
      '/ai-gateway/virtual-model-configs/list',
      (_req, res) => {
        res.json({ virtualModelConfigs: [], cursor: 'stuck' });
      }
    );
    client.setArgv('ai-gateway', 'models', 'list', '--virtual');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('The list is incomplete.');
    expect(await exitCodePromise).toBe(1);
    client.config.currentTeam = undefined;
  });

  it('degrades to catalog-only when the virtual fetch fails merged', async () => {
    useUser();
    const team = useTeam();
    useListModels();
    client.config.currentTeam = team.id;
    client.scenario.get(
      '/ai-gateway/virtual-model-configs/list',
      (_req, res) => {
        res.status(500).json({ error: { message: 'boom' } });
      }
    );
    client.setArgv('ai-gateway', 'models', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('anthropic/claude-opus-4.8');
    expect(await exitCodePromise).toBe(0);
    client.config.currentTeam = undefined;
  });

  it('dedupes catalog rows the virtual fetch also returns', async () => {
    useUser();
    const team = useTeam();
    useListModels([
      sampleModel,
      {
        id: 'vmc/support-chat',
        object: 'model',
        owned_by: 'virtual',
        name: 'Support Chat',
        type: 'virtual',
      },
    ]);
    client.config.currentTeam = team.id;
    client.scenario.get(
      '/ai-gateway/virtual-model-configs/list',
      (_req, res) => {
        res.json({
          virtualModelConfigs: [
            {
              virtualModelSlug: 'support-chat',
              displayName: 'Support Chat',
              ownerId: 'team_abc',
              createdAt: 1,
              updatedAt: 2,
            },
          ],
          cursor: null,
        });
      }
    );
    client.setArgv('ai-gateway', 'models', 'list', '--format', 'json');

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    const output = JSON.parse(client.stdout.getFullOutput()) as unknown as {
      models: { id: string }[];
    };
    expect(output.models.filter(m => m.id === 'vmc/support-chat')).toHaveLength(
      1
    );
    client.config.currentTeam = undefined;
  });

  it('hides catalog virtual models with --no-virtual', async () => {
    useUser();
    const team = useTeam();
    useListModels([
      sampleModel,
      {
        id: 'vmc/support-chat',
        object: 'model',
        owned_by: 'virtual',
        name: 'Support Chat',
        type: 'virtual',
      },
    ]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'models', 'list', '--no-virtual');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).not.toOutput('vmc/support-chat');
    expect(await exitCodePromise).toBe(0);
    client.config.currentTeam = undefined;
  });

  it('hides virtual models with --no-virtual', async () => {
    useUser();
    const team = useTeam();
    useListModels();
    client.config.currentTeam = team.id;
    let virtualCalled = false;
    client.scenario.get(
      '/ai-gateway/virtual-model-configs/list',
      (_req, res) => {
        virtualCalled = true;
        res.json({ virtualModelConfigs: [], cursor: null });
      }
    );
    client.setArgv('ai-gateway', 'models', 'list', '--no-virtual');

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(virtualCalled).toBe(false);
    client.config.currentTeam = undefined;
  });

  it('rejects --virtual and --no-virtual together', async () => {
    useUser();
    useListModels();
    client.setArgv('ai-gateway', 'models', 'list', '--virtual', '--no-virtual');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput(
      'Pass only one of --virtual and --no-virtual.'
    );
    expect(await exitCodePromise).toBe(2);
  });

  it('skips virtual models when no team is selected', async () => {
    useUser();
    useListModels();
    client.config.currentTeam = undefined;
    let virtualCalled = false;
    client.scenario.get(
      '/ai-gateway/virtual-model-configs/list',
      (_req, res) => {
        virtualCalled = true;
        res.json({ virtualModelConfigs: [], cursor: null });
      }
    );
    client.setArgv('ai-gateway', 'models', 'list');

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(virtualCalled).toBe(false);
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
