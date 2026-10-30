import { describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import {
  listModelEndpoints,
  listModels,
} from '../../../../src/util/ai-gateway/models';
import { getVirtualModel } from '../../../../src/util/ai-gateway/virtual-models';

vi.mock('../../../../src/util/ai-gateway/models', () => ({
  listModels: vi.fn(async () => []),
  listModelEndpoints: vi.fn(async () => {
    throw new Error('no endpoints');
  }),
}));

vi.mock(
  '../../../../src/util/ai-gateway/virtual-models',
  async importActual => {
    const actual =
      await importActual<
        typeof import('../../../../src/util/ai-gateway/virtual-models')
      >();
    return {
      ...actual,
      getVirtualModel: vi.fn(async () => {
        throw new Error('not found');
      }),
    };
  }
);

const mockListModels = vi.mocked(listModels);
const mockListModelEndpoints = vi.mocked(listModelEndpoints);
const mockGetVirtualModel = vi.mocked(getVirtualModel);

function useCreateVirtualModel() {
  let body: Record<string, unknown> | undefined;
  client.scenario.post('/ai-gateway/virtual-model-configs', (req, res) => {
    body = req.body;
    res.json({
      ownerId: 'team_abc',
      virtualModelSlug: req.body?.virtualModelSlug ?? 'my-model',
      createdAt: 1,
      updatedAt: 2,
    });
  });
  return () => body;
}

describe('ai-gateway virtual-models create', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'virtual-models', 'create', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:virtual-models', value: 'virtual-models' },
        { key: 'flag:help', value: 'ai-gateway virtual-models:create' },
      ]);
    });
  });

  it('creates from flags alone', async () => {
    const team = useTeam();
    useUser();
    const getBody = useCreateVirtualModel();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'create',
      'my-model',
      '--model',
      'openai/gpt-5.1'
    );

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getBody()).toMatchObject({
      virtualModelSlug: 'my-model',
      modelSlug: 'openai/gpt-5.1',
    });
  });

  it('applies the documented alias default without prompting', async () => {
    const team = useTeam();
    useUser();
    const getBody = useCreateVirtualModel();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'create',
      'my-model',
      '--model',
      'openai/gpt-5.1'
    );

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getBody()).toMatchObject({ kind: 'alias' });
  });

  it('never sends ownerId, since the api derives it from auth', async () => {
    const team = useTeam();
    useUser();
    const getBody = useCreateVirtualModel();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'create',
      'my-model',
      '--model',
      'openai/gpt-5.1'
    );

    await aiGateway(client);

    expect(getBody()).not.toHaveProperty('ownerId');
  });

  it('accepts fields with no flag through --config', async () => {
    const team = useTeam();
    useUser();
    const getBody = useCreateVirtualModel();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'create',
      'my-model',
      '--model',
      'openai/gpt-5.1',
      '--config',
      '{"sort":"cost","zeroDataRetention":true}'
    );

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getBody()).toMatchObject({
      sort: 'cost',
      zeroDataRetention: true,
    });
  });

  it('lets a flag win over the same key in --config', async () => {
    const team = useTeam();
    useUser();
    const getBody = useCreateVirtualModel();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'create',
      'my-model',
      '--model',
      'openai/gpt-5.1',
      '--config',
      '{"modelSlug":"anthropic/claude-sonnet-4.5"}'
    );

    await aiGateway(client);

    expect(getBody()).toMatchObject({ modelSlug: 'openai/gpt-5.1' });
  });

  it('splits comma-separated provider lists', async () => {
    const team = useTeam();
    useUser();
    const getBody = useCreateVirtualModel();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'create',
      'my-model',
      '--model',
      'openai/gpt-5.1',
      '--provider-order',
      'openai, anthropic'
    );

    await aiGateway(client);

    expect(getBody()).toMatchObject({
      providerOrder: ['openai', 'anthropic'],
    });
  });

  it('rejects malformed --config', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'create',
      'my-model',
      '--config',
      'not-json'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('must be valid JSON');
    expect(await exitCodePromise).toBe(1);
  });

  it('rejects an unknown --kind', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'create',
      'my-model',
      '--kind',
      'wormhole',
      '--model',
      'openai/gpt-5.1'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('--kind must be one of');
    expect(await exitCodePromise).toBe(2);
  });

  it('offers a searchable catalog for the wizard model step', async () => {
    const team = useTeam();
    useUser();
    const getBody = useCreateVirtualModel();
    client.config.currentTeam = team.id;
    mockListModels.mockResolvedValueOnce([
      { id: 'openai/gpt-5.1', name: 'GPT-5.1' },
      { id: 'anthropic/claude-opus-4.8', name: 'Claude Opus 4.8' },
      { id: 'moonshotai/kimi-k2-thinking', name: 'Kimi K2 Thinking' },
      { id: 'xai/grok-4.1-fast-reasoning' },
    ] as never);
    vi.spyOn(client.input, 'checkbox').mockImplementation((() =>
      Promise.resolve([])) as unknown as typeof client.input.checkbox);
    let searchSource:
      | ((term?: string) => { name: string; value: string }[])
      | undefined;
    vi.spyOn(client.input, 'search').mockImplementation(((opts: {
      source: (term?: string) => { name: string; value: string }[];
    }) => {
      searchSource = opts.source;
      return Promise.resolve('moonshotai/kimi-k2-thinking');
    }) as unknown as typeof client.input.search);
    vi.spyOn(client.input, 'text').mockImplementation((() =>
      Promise.resolve('my-model')) as unknown as typeof client.input.text);
    client.setArgv('ai-gateway', 'virtual-models', 'create');

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(searchSource?.(undefined)).toHaveLength(4);
    expect(searchSource?.('kimi')).toEqual([
      {
        name: 'moonshotai/kimi-k2-thinking',
        value: 'moonshotai/kimi-k2-thinking',
      },
    ]);
    expect(searchSource?.('grok')).toEqual([
      {
        name: 'xai/grok-4.1-fast-reasoning',
        value: 'xai/grok-4.1-fast-reasoning',
      },
    ]);
    expect(searchSource?.('claude opus')).toEqual([
      { name: 'anthropic/claude-opus-4.8', value: 'anthropic/claude-opus-4.8' },
    ]);
    expect(getBody()).toMatchObject({
      virtualModelSlug: 'my-model',
      modelSlug: 'moonshotai/kimi-k2-thinking',
    });
    vi.restoreAllMocks();
  });

  it('falls back to free text when the catalog cannot be fetched', async () => {
    const team = useTeam();
    useUser();
    const getBody = useCreateVirtualModel();
    client.config.currentTeam = team.id;
    mockListModels.mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(client.input, 'checkbox').mockImplementation((() =>
      Promise.resolve([])) as unknown as typeof client.input.checkbox);
    const searchSpy = vi.spyOn(client.input, 'search');
    vi.spyOn(client.input, 'text').mockImplementation(((opts: {
      message: string;
    }) =>
      Promise.resolve(
        opts.message.startsWith('Slug') ? 'my-model' : 'openai/gpt-5.1'
      )) as unknown as typeof client.input.text);
    client.setArgv('ai-gateway', 'virtual-models', 'create');

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(searchSpy).not.toHaveBeenCalled();
    expect(getBody()).toMatchObject({ modelSlug: 'openai/gpt-5.1' });
    vi.restoreAllMocks();
  });

  it('guides through selected fields with typed prompts', async () => {
    const team = useTeam();
    useUser();
    const getBody = useCreateVirtualModel();
    client.config.currentTeam = team.id;
    const confirms: string[] = [];
    vi.spyOn(client.input, 'confirm').mockImplementation(((message: string) => {
      confirms.push(message);
      return Promise.resolve(true);
    }) as typeof client.input.confirm);
    vi.spyOn(client.input, 'select').mockImplementation((() =>
      Promise.resolve('cost')) as unknown as typeof client.input.select);
    vi.spyOn(client.input, 'checkbox').mockImplementation((() =>
      Promise.resolve([
        'sort',
        'speed',
        'zeroDataRetention',
      ])) as unknown as typeof client.input.checkbox);
    vi.spyOn(client.input, 'text').mockImplementation(((opts: {
      message: string;
    }) =>
      Promise.resolve(
        opts.message.startsWith('Slug') ? 'my-model' : 'openai/gpt-5.1'
      )) as unknown as typeof client.input.text);
    client.setArgv('ai-gateway', 'virtual-models', 'create');

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getBody()).toMatchObject({
      virtualModelSlug: 'my-model',
      modelSlug: 'openai/gpt-5.1',
      sort: 'cost',
      speed: 'fast',
      allowFallbackFromFast: true,
      zeroDataRetention: true,
    });
    expect(confirms).toContain('Enable fast mode?');
    expect(confirms).toContain(
      'Allow fallback to standard providers when fast ones are unavailable?'
    );
    vi.restoreAllMocks();
  });

  it('accepts provider options as the unwrapped record in the wizard', async () => {
    const team = useTeam();
    useUser();
    const getBody = useCreateVirtualModel();
    client.config.currentTeam = team.id;
    vi.spyOn(client.input, 'checkbox').mockImplementation((() =>
      Promise.resolve([
        'providerOptions',
      ])) as unknown as typeof client.input.checkbox);
    let providerOptionsValidator:
      | ((value: string) => string | boolean)
      | undefined;
    vi.spyOn(client.input, 'text').mockImplementation(((opts: {
      message: string;
      validate?: (value: string) => string | boolean;
    }) => {
      if (opts.message.startsWith('Slug')) {
        return Promise.resolve('my-model');
      }
      if (opts.message.startsWith('Model')) {
        return Promise.resolve('openai/gpt-5.1');
      }
      providerOptionsValidator = opts.validate;
      return Promise.resolve('{"anthropic":{"effort":"high"}}');
    }) as unknown as typeof client.input.text);
    client.setArgv('ai-gateway', 'virtual-models', 'create');

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getBody()).toMatchObject({
      providerOptions: { anthropic: { effort: 'high' } },
    });
    expect(providerOptionsValidator?.('{"anthropic":"high"}')).toContain(
      'providerOptions must be an object of per-provider objects'
    );
    expect(providerOptionsValidator?.('{nope')).toBe(
      'Provider options must be valid JSON.'
    );
    vi.restoreAllMocks();
  });

  it('rejects a taken or malformed slug at the wizard slug step', async () => {
    const team = useTeam();
    useUser();
    useCreateVirtualModel();
    client.config.currentTeam = team.id;
    vi.spyOn(client.input, 'checkbox').mockImplementation((() =>
      Promise.resolve([])) as unknown as typeof client.input.checkbox);
    let slugValidator:
      | ((value: string) => Promise<string | boolean>)
      | undefined;
    vi.spyOn(client.input, 'text').mockImplementation(((opts: {
      message: string;
      validate?: (value: string) => Promise<string | boolean>;
    }) => {
      if (opts.message.startsWith('Slug')) {
        slugValidator = opts.validate;
        return Promise.resolve('my-free-slug');
      }
      return Promise.resolve('openai/gpt-5.1');
    }) as unknown as typeof client.input.text);
    client.setArgv('ai-gateway', 'virtual-models', 'create');

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    await expect(slugValidator?.('Bad Slug!')).resolves.toBe(
      'Letters, numbers, hyphens, underscores, periods only.'
    );
    await expect(slugValidator?.('My_VMC.1')).resolves.toBe(true);
    await expect(slugValidator?.('')).resolves.toBe('A slug is required.');
    mockGetVirtualModel.mockResolvedValueOnce({} as never);
    await expect(slugValidator?.('taken-slug')).resolves.toBe(
      'That slug is already taken.'
    );
    await expect(slugValidator?.('free-slug')).resolves.toBe(true);
    vi.restoreAllMocks();
  });

  it('validates provider entries against the picked model', async () => {
    const team = useTeam();
    useUser();
    const getBody = useCreateVirtualModel();
    client.config.currentTeam = team.id;
    mockListModelEndpoints.mockResolvedValueOnce({
      endpoints: [
        { provider_name: 'alibaba' },
        { provider_name: 'alibaba' },
        { provider_name: 'deepinfra' },
      ],
    } as never);
    vi.spyOn(client.input, 'checkbox').mockImplementation((() =>
      Promise.resolve([
        'providerOnly',
      ])) as unknown as typeof client.input.checkbox);
    let providerValidator:
      | ((value: string) => Promise<string | boolean>)
      | undefined;
    vi.spyOn(client.input, 'text').mockImplementation(((opts: {
      message: string;
      validate?: (value: string) => Promise<string | boolean>;
    }) => {
      if (opts.message.startsWith('Slug')) {
        return Promise.resolve('my-model');
      }
      if (opts.message.startsWith('Model')) {
        return Promise.resolve('alibaba/qwen-3.6-max-preview');
      }
      providerValidator = opts.validate;
      return Promise.resolve('alibaba');
    }) as unknown as typeof client.input.text);
    client.setArgv('ai-gateway', 'virtual-models', 'create');

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    await expect(providerValidator?.('wow')).resolves.toBe(
      'Unknown provider: wow. This model is served by: alibaba, deepinfra.'
    );
    await expect(providerValidator?.('alibaba, deepinfra')).resolves.toBe(true);
    expect(getBody()).toMatchObject({ providerOnly: ['alibaba'] });
    vi.restoreAllMocks();
  });

  it.each([
    {
      name: 'names the providers serving the model',
      endpoints: [{ provider_name: 'alibaba' }, { provider_name: 'deepinfra' }],
      expected:
        'Restrict to these providers, comma-separated (available: alibaba, deepinfra):',
    },
    {
      name: 'offers no example when one provider serves the model',
      endpoints: [{ provider_name: 'alibaba' }],
      expected: 'Restrict to these providers, comma-separated:',
    },
    {
      name: 'offers no example when the endpoint lookup finds nothing',
      endpoints: [],
      expected: 'Restrict to these providers, comma-separated:',
    },
  ])('$name', async ({ endpoints, expected }) => {
    const team = useTeam();
    useUser();
    useCreateVirtualModel();
    client.config.currentTeam = team.id;
    mockListModelEndpoints.mockResolvedValueOnce({ endpoints } as never);
    vi.spyOn(client.input, 'checkbox').mockImplementation((() =>
      Promise.resolve([
        'providerOnly',
      ])) as unknown as typeof client.input.checkbox);
    let providerPrompt: string | undefined;
    vi.spyOn(client.input, 'text').mockImplementation(((opts: {
      message: string;
    }) => {
      if (opts.message.startsWith('Slug')) {
        return Promise.resolve('my-model');
      }
      if (opts.message.startsWith('Model')) {
        return Promise.resolve('alibaba/qwen-3.6-max-preview');
      }
      providerPrompt = opts.message;
      return Promise.resolve('alibaba');
    }) as unknown as typeof client.input.text);
    client.setArgv('ai-gateway', 'virtual-models', 'create');

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(providerPrompt).toBe(expected);
    vi.restoreAllMocks();
  });

  it('does not look up providers when fields come from flags', async () => {
    const team = useTeam();
    useUser();
    const getBody = useCreateVirtualModel();
    client.config.currentTeam = team.id;
    mockListModelEndpoints.mockClear();
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'create',
      'my-model',
      '--model',
      'alibaba/qwen-3.6-max-preview',
      '--provider-only',
      'alibaba'
    );

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getBody()).toMatchObject({ providerOnly: ['alibaba'] });
    expect(mockListModelEndpoints).not.toHaveBeenCalled();
  });

  it('validates fallback models against the catalog', async () => {
    const team = useTeam();
    useUser();
    const getBody = useCreateVirtualModel();
    client.config.currentTeam = team.id;
    mockListModels.mockResolvedValueOnce([
      { id: 'openai/gpt-5.1', name: 'GPT-5.1' },
      { id: 'zai/glm-5.1', name: 'GLM 5.1' },
    ] as never);
    vi.spyOn(client.input, 'search').mockImplementation((() =>
      Promise.resolve(
        'openai/gpt-5.1'
      )) as unknown as typeof client.input.search);
    vi.spyOn(client.input, 'checkbox').mockImplementation((() =>
      Promise.resolve(['models'])) as unknown as typeof client.input.checkbox);
    let modelsValidator:
      | ((value: string) => Promise<string | boolean>)
      | undefined;
    vi.spyOn(client.input, 'text').mockImplementation(((opts: {
      message: string;
      validate?: (value: string) => Promise<string | boolean>;
    }) => {
      if (opts.message.startsWith('Slug')) {
        return Promise.resolve('my-model');
      }
      modelsValidator = opts.validate;
      return Promise.resolve('zai/glm-5.1');
    }) as unknown as typeof client.input.text);
    client.setArgv('ai-gateway', 'virtual-models', 'create');

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    await expect(modelsValidator?.('nope/nope')).resolves.toBe(
      'Unknown model: nope/nope.'
    );
    await expect(modelsValidator?.('zai/glm-5.1')).resolves.toBe(true);
    expect(getBody()).toMatchObject({ models: ['zai/glm-5.1'] });
    vi.restoreAllMocks();
  });

  it('offers a raw JSON step in the wizard and merges what it returns', async () => {
    const team = useTeam();
    useUser();
    const getBody = useCreateVirtualModel();
    client.config.currentTeam = team.id;
    vi.spyOn(client.input, 'checkbox').mockImplementation((() =>
      Promise.resolve([
        'otherJson',
      ])) as unknown as typeof client.input.checkbox);
    vi.spyOn(client.input, 'text').mockImplementation(((opts: {
      message: string;
    }) => {
      if (opts.message.startsWith('Slug')) {
        return Promise.resolve('my-model');
      }
      if (opts.message.startsWith('Model')) {
        return Promise.resolve('openai/gpt-5.1');
      }
      return Promise.resolve('{"sort":"cost","zeroDataRetention":true}');
    }) as unknown as typeof client.input.text);
    client.setArgv('ai-gateway', 'virtual-models', 'create');

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getBody()).toMatchObject({
      virtualModelSlug: 'my-model',
      modelSlug: 'openai/gpt-5.1',
      sort: 'cost',
      zeroDataRetention: true,
    });
    vi.restoreAllMocks();
  });

  it('rejects unknown fields from the wizard raw JSON step', async () => {
    const team = useTeam();
    useUser();
    useCreateVirtualModel();
    client.config.currentTeam = team.id;
    vi.spyOn(client.input, 'checkbox').mockImplementation((() =>
      Promise.resolve([
        'otherJson',
      ])) as unknown as typeof client.input.checkbox);
    const validators: ((value: string) => string | boolean)[] = [];
    vi.spyOn(client.input, 'text').mockImplementation(((opts: {
      message: string;
      validate?: (value: string) => string | boolean;
    }) => {
      if (opts.validate) {
        validators.push(opts.validate);
      }
      if (opts.message.startsWith('Slug')) {
        return Promise.resolve('my-model');
      }
      if (opts.message.startsWith('Model')) {
        return Promise.resolve('openai/gpt-5.1');
      }
      return Promise.resolve('{}');
    }) as unknown as typeof client.input.text);
    client.setArgv('ai-gateway', 'virtual-models', 'create');

    await aiGateway(client);

    const jsonValidator = validators.at(-1);
    expect(jsonValidator?.('{"nope":1}')).toContain('Unknown field: nope');
    expect(jsonValidator?.('not-json')).toBe('The value must be valid JSON.');
    expect(jsonValidator?.('[1,2]')).toBe('The value must be a JSON object.');
    expect(jsonValidator?.('{"sort":"cost"}')).toBe(true);
    vi.restoreAllMocks();
  });

  it('never prompts when every field is supplied, even with a TTY', async () => {
    const team = useTeam();
    useUser();
    useCreateVirtualModel();
    client.config.currentTeam = team.id;
    const confirmSpy = vi.spyOn(client.input, 'confirm');
    const textSpy = vi.spyOn(client.input, 'text');
    const selectSpy = vi.spyOn(client.input, 'select');
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'create',
      'my-model',
      '--model',
      'openai/gpt-5.1'
    );

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(textSpy).not.toHaveBeenCalled();
    expect(selectSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('rejects a field that is not settable on a virtual model', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.stdin.isTTY = false;
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'create',
      'my-model',
      '--model',
      'openai/gpt-5.1',
      '--config',
      '{"zeroDataRetension":true}'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Unknown field: zeroDataRetension');
    expect(await exitCodePromise).toBe(1);
  });

  it('rejects inherited Object property names as fields', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.stdin.isTTY = false;
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'create',
      'my-model',
      '--model',
      'openai/gpt-5.1',
      '--config',
      '{"toString":"x","__proto__":{"polluted":true}}'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('toString');
    expect(await exitCodePromise).toBe(1);
  });

  it('names every unknown field at once', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.stdin.isTTY = false;
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'create',
      'my-model',
      '--model',
      'openai/gpt-5.1',
      '--config',
      '{"nope":1,"alsoNope":2}'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Unknown fields: nope, alsoNope');
    expect(await exitCodePromise).toBe(1);
  });

  it('accepts the full set of settable fields', async () => {
    const team = useTeam();
    useUser();
    const getBody = useCreateVirtualModel();
    client.config.currentTeam = team.id;
    client.stdin.isTTY = false;
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'create',
      'my-model',
      '--model',
      'openai/gpt-5.1',
      '--config',
      JSON.stringify({
        displayName: 'My model',
        description: 'desc',
        status: 'active',
        visibility: 'internal',
        baseUrl: 'https://example.com',
        observabilityTags: ['prod'],
        inferenceRegion: { scope: 'zone', geoRegion: 'eu' },
        models: ['openai/gpt-5.1'],
        sort: 'cost',
        has: ['vision'],
        caching: 'auto',
        serviceTier: 'flex',
        providerTimeouts: { byok: { openai: 5000 } },
        zeroDataRetention: true,
        disallowPromptTraining: true,
        speed: 'fast',
        allowFallbackFromFast: true,
      })
    );

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getBody()).toMatchObject({ sort: 'cost', zeroDataRetention: true });
  });

  it('errors instead of hanging when a required field is missing without a TTY', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.stdin.isTTY = false;
    client.setArgv('ai-gateway', 'virtual-models', 'create');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('A slug is required');
    expect(await exitCodePromise).toBe(2);
  });

  it('returns a missing-arguments agent error instead of prompting when non-interactive on a TTY', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.nonInteractive = true;
    const textSpy = vi.spyOn(client.input, 'text');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as () => never);
    client.setArgv('ai-gateway', 'virtual-models', 'create');

    await expect(aiGateway(client)).rejects.toThrow('exit');

    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(textSpy).not.toHaveBeenCalled();
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      status: 'error',
      reason: 'missing_arguments',
    });
    vi.restoreAllMocks();
    client.nonInteractive = false;
  });

  it('does not prompt an agent attached to a TTY', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    // An agent on a pty leaves nonInteractive false, so isAgent is the only
    // signal that stops the wizard from hanging on a prompt nobody answers.
    client.nonInteractive = false;
    client.isAgent = true;
    const textSpy = vi.spyOn(client.input, 'text');
    client.setArgv('ai-gateway', 'virtual-models', 'create');

    const exitCode = await aiGateway(client);

    expect(textSpy).not.toHaveBeenCalled();
    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('A slug is required');
    vi.restoreAllMocks();
    client.isAgent = false;
  });

  it('redacts an unrecognized --kind value in telemetry', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'create',
      'my-model',
      '--kind',
      'wormhole',
      '--model',
      'openai/gpt-5.1'
    );

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(2);
    const kindEvent = client.telemetryEventStore.readonlyEvents.find(
      event => event.key === 'option:kind'
    );
    expect(kindEvent?.value).toBe('[REDACTED]');
  });

  it('ships a recognized --kind value in telemetry', async () => {
    const team = useTeam();
    useUser();
    useCreateVirtualModel();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'create',
      'my-model',
      '--kind',
      'relay',
      '--model',
      'openai/gpt-5.1'
    );

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    const kindEvent = client.telemetryEventStore.readonlyEvents.find(
      event => event.key === 'option:kind'
    );
    expect(kindEvent?.value).toBe('relay');
  });
});
