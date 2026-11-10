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
  createdAt: 1,
  updatedAt: 2,
};

const archivedVirtualModel = {
  ownerId: 'team_abc',
  virtualModelSlug: 'shelved-model',
  modelSlug: 'openai/gpt-4o',
  kind: 'alias',
  status: 'archived',
  createdAt: 1,
  updatedAt: 2,
};

// Mirrors the API: includeArchived=false filters archived rows server-side.
function useListVirtualModels(virtualModelConfigs: { status?: string }[]) {
  client.scenario.get('/ai-gateway/virtual-model-configs/list', (req, res) => {
    const rows =
      req.query.includeArchived === 'false'
        ? virtualModelConfigs.filter(vm => vm.status !== 'archived')
        : virtualModelConfigs;
    res.json({ virtualModelConfigs: rows, cursor: null });
  });
}

function usePagedVirtualModels(pages: Record<string, unknown[]>) {
  const queries: Record<string, unknown>[] = [];
  client.scenario.get('/ai-gateway/virtual-model-configs/list', (req, res) => {
    queries.push(req.query as Record<string, unknown>);
    const cursor = (req.query.cursor as string | undefined) ?? 'first';
    const cursors = Object.keys(pages);
    const index = cursors.indexOf(cursor);
    if (index === -1) {
      res.status(400).json({
        error: {
          code: 'invalid_cursor',
          message: 'Invalid pagination cursor.',
        },
      });
      return;
    }
    res.json({
      virtualModelConfigs: pages[cursor],
      cursor: cursors[index + 1] ?? null,
    });
  });
  return queries;
}

describe('ai-gateway virtual-models list', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'virtual-models', 'list', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:virtual-models', value: 'virtual-models' },
        { key: 'flag:help', value: 'ai-gateway virtual-models:list' },
      ]);
    });
  });

  it('lists virtual models in a table', async () => {
    const team = useTeam();
    useUser();
    useListVirtualModels([sampleVirtualModel]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'virtual-models', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('my-model');
    expect(await exitCodePromise).toBe(0);
  });

  it('reports when there are no virtual models', async () => {
    const team = useTeam();
    useUser();
    useListVirtualModels([]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'virtual-models', 'ls');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('No virtual models found');
    expect(await exitCodePromise).toBe(0);
  });

  it('hides archived virtual models by default', async () => {
    const team = useTeam();
    useUser();
    useListVirtualModels([archivedVirtualModel]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'virtual-models', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('No virtual models found');
    expect(await exitCodePromise).toBe(0);
  });

  it('shows archived virtual models with --include-archived', async () => {
    const team = useTeam();
    useUser();
    useListVirtualModels([sampleVirtualModel, archivedVirtualModel]);
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'virtual-models',
      'list',
      '--include-archived'
    );

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    const out = client.stdout.getFullOutput();
    expect(out).toContain('shelved-model');
    expect(out).toContain('archived');
  });

  describe('pagination', () => {
    function setup() {
      const team = useTeam();
      useUser();
      client.config.currentTeam = team.id;
    }

    const secondModel = {
      ...sampleVirtualModel,
      virtualModelSlug: 'second-page-model',
    };

    it('requests one page of 20 without archived and returns the cursor in JSON', async () => {
      setup();
      const queries = usePagedVirtualModels({
        first: [sampleVirtualModel],
        c2: [secondModel],
      });
      client.setArgv('ai-gateway', 'virtual-models', 'ls', '--format', 'json');

      expect(await aiGateway(client)).toBe(0);
      expect(queries).toHaveLength(1);
      expect(queries[0]).toMatchObject({
        limit: '20',
        includeArchived: 'false',
      });
      expect(queries[0]).not.toHaveProperty('cursor');
      expect(queries[0]).not.toHaveProperty('ownerId');
      const json = JSON.parse(client.stdout.getFullOutput());
      expect(
        json.virtualModels.map(
          (vm: { virtualModelSlug: string }) => vm.virtualModelSlug
        )
      ).toEqual(['my-model']);
      expect(json.pagination).toEqual({ next: 'c2' });
    });

    it('sends includeArchived=true with --include-archived', async () => {
      setup();
      const queries = usePagedVirtualModels({ first: [sampleVirtualModel] });
      client.setArgv(
        'ai-gateway',
        'virtual-models',
        'ls',
        '--include-archived',
        '--format',
        'json'
      );

      expect(await aiGateway(client)).toBe(0);
      expect(queries[0]).toMatchObject({ includeArchived: 'true' });
    });

    it('passes --next and --limit to the API', async () => {
      setup();
      const queries = usePagedVirtualModels({
        first: [sampleVirtualModel],
        c2: [secondModel],
      });
      client.setArgv(
        'ai-gateway',
        'virtual-models',
        'ls',
        '--next',
        'c2',
        '--limit',
        '5',
        '--format',
        'json'
      );

      expect(await aiGateway(client)).toBe(0);
      expect(queries[0]).toMatchObject({ cursor: 'c2', limit: '5' });
      const json = JSON.parse(client.stdout.getFullOutput());
      expect(
        json.virtualModels.map(
          (vm: { virtualModelSlug: string }) => vm.virtualModelSlug
        )
      ).toEqual(['second-page-model']);
      expect(json.pagination).toEqual({ next: null });
    });

    it('prints the hint, not the empty state, for an empty page with a cursor', async () => {
      setup();
      usePagedVirtualModels({ first: [], c2: [secondModel] });
      client.setArgv('ai-gateway', 'virtual-models', 'ls');

      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput(
        '  Next page:\n    vercel ai-gateway virtual-models ls --next=c2\n'
      );
      expect(await exitCodePromise).toBe(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('No results on this page.');
      expect(stderr).not.toContain('No virtual models found');
    });

    it('keeps --include-archived in the next-page hint', async () => {
      setup();
      usePagedVirtualModels({ first: [sampleVirtualModel], c2: [] });
      client.setArgv(
        'ai-gateway',
        'virtual-models',
        'ls',
        '--include-archived'
      );

      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput(
        '  Next page:\n    vercel ai-gateway virtual-models ls --include-archived --next=c2\n'
      );
      expect(await exitCodePromise).toBe(0);
    });

    it('reports a cursor the API rejects', async () => {
      setup();
      usePagedVirtualModels({ first: [sampleVirtualModel] });
      client.setArgv(
        'ai-gateway',
        'virtual-models',
        'ls',
        '--next=stale',
        '--format',
        'json'
      );

      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput('Invalid pagination cursor.');
      expect(await exitCodePromise).toBe(1);
    });

    it('prints the next-page hint in the table view', async () => {
      setup();
      usePagedVirtualModels({ first: [sampleVirtualModel], c2: [] });
      client.setArgv('ai-gateway', 'virtual-models', 'ls');

      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput(
        '  Next page:\n    vercel ai-gateway virtual-models ls --next=c2\n'
      );
      expect(await exitCodePromise).toBe(0);
    });

    it('reports no more virtual models past the last page', async () => {
      setup();
      usePagedVirtualModels({ first: [sampleVirtualModel], c2: [] });
      client.setArgv('ai-gateway', 'virtual-models', 'ls', '--next', 'c2');

      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput('No more virtual models.');
      expect(await exitCodePromise).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain(
        'No virtual models found'
      );
    });

    it('rejects an out-of-range --limit', async () => {
      setup();
      client.setArgv('ai-gateway', 'virtual-models', 'ls', '--limit', '101');

      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput(
        'The --limit option must be an integer from 1 to 100.'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('tracks --limit and redacts --next in telemetry', async () => {
      setup();
      usePagedVirtualModels({
        first: [sampleVirtualModel],
        'secret-cursor': [secondModel],
      });
      client.setArgv(
        'ai-gateway',
        'virtual-models',
        'ls',
        '--limit',
        '5',
        '--next',
        'secret-cursor',
        '--format',
        'json'
      );

      expect(await aiGateway(client)).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:virtual-models', value: 'virtual-models' },
        { key: 'subcommand:list', value: 'ls' },
        { key: 'option:limit', value: '5' },
        { key: 'option:next', value: '[REDACTED]' },
        { key: 'option:format', value: 'json' },
      ]);
    });
  });

  it('outputs JSON with --format json', async () => {
    const team = useTeam();
    useUser();
    useListVirtualModels([sampleVirtualModel]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'virtual-models', 'list', '--format', 'json');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"virtualModels"');
    expect(await exitCodePromise).toBe(0);
  });

  it('outputs JSON when non-interactive even without --format json', async () => {
    const team = useTeam();
    useUser();
    useListVirtualModels([sampleVirtualModel]);
    client.config.currentTeam = team.id;
    client.nonInteractive = true;
    client.setArgv('ai-gateway', 'virtual-models', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"virtualModels"');
    expect(await exitCodePromise).toBe(0);
    client.nonInteractive = false;
  });
});
