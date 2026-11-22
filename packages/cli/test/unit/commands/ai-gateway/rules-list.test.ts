import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

const sampleRule = {
  ownerId: 'team_abc',
  ruleId: 'rule_1',
  type: 'rewrite',
  match: { model: 'anthropic/claude-fable-5' },
  action: { rewriteModel: 'anthropic/claude-opus-4.8' },
  enabled: true,
  createdAt: 1,
  updatedAt: 2,
};

function useListRules(rules: unknown[] = [sampleRule]) {
  let query: unknown;
  client.scenario.get('/ai-gateway/rules', (req, res) => {
    query = req.query;
    res.json({ rules });
  });
  return () => query;
}

describe('ai-gateway rules list', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'rules', 'list', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:rules', value: 'rules' },
        { key: 'flag:help', value: 'ai-gateway rules:list' },
      ]);
    });
  });

  it('lists rules in a table', async () => {
    const team = useTeam();
    useUser();
    useListRules();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'rules', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('rule_1');
    expect(await exitCodePromise).toBe(0);
  });

  it('reports when there are no rules', async () => {
    const team = useTeam();
    useUser();
    useListRules([]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'rules', 'ls');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('No routing rules found');
    expect(await exitCodePromise).toBe(0);
  });

  it('forwards --include-disabled to the API', async () => {
    const team = useTeam();
    useUser();
    const getQuery = useListRules([]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'rules', 'list', '--include-disabled');

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getQuery()).toMatchObject({ includeDisabled: 'true' });
  });

  it('outputs JSON with --format json', async () => {
    const team = useTeam();
    useUser();
    useListRules();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'rules', 'list', '--format', 'json');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"rules"');
    expect(await exitCodePromise).toBe(0);
  });

  describe('pagination', () => {
    function usePagedRules(pages: Record<string, unknown[]>) {
      const queries: Record<string, unknown>[] = [];
      client.scenario.get('/ai-gateway/rules', (req, res) => {
        queries.push(req.query as Record<string, unknown>);
        const cursor = (req.query.cursor as string | undefined) ?? 'first';
        const cursors = Object.keys(pages);
        const index = cursors.indexOf(cursor);
        const nextCursor = cursors[index + 1] ?? null;
        res.json({ rules: pages[cursor] ?? [], nextCursor });
      });
      return queries;
    }

    function setup() {
      const team = useTeam();
      useUser();
      client.config.currentTeam = team.id;
    }

    it('requests one page of 20 and returns the cursor in JSON', async () => {
      setup();
      const queries = usePagedRules({
        first: [sampleRule],
        c2: [{ ...sampleRule, ruleId: 'rule_2' }],
      });
      client.setArgv('ai-gateway', 'rules', 'ls', '--format', 'json');

      expect(await aiGateway(client)).toBe(0);
      expect(queries).toHaveLength(1);
      expect(queries[0]).toMatchObject({ limit: '20' });
      expect(queries[0]).not.toHaveProperty('cursor');
      expect(queries[0]).not.toHaveProperty('includeDisabled');
      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.rules.map((r: { ruleId: string }) => r.ruleId)).toEqual([
        'rule_1',
      ]);
      expect(json.pagination).toEqual({ next: 'c2' });
    });

    it('passes --next and --limit to the API as cursor and limit', async () => {
      setup();
      const queries = usePagedRules({
        first: [sampleRule],
        c2: [{ ...sampleRule, ruleId: 'rule_2' }],
      });
      client.setArgv(
        'ai-gateway',
        'rules',
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
      expect(json.rules.map((r: { ruleId: string }) => r.ruleId)).toEqual([
        'rule_2',
      ]);
      expect(json.pagination).toEqual({ next: null });
    });

    it('keeps sending includeDisabled alongside the page params', async () => {
      setup();
      const queries = usePagedRules({ first: [sampleRule] });
      client.setArgv(
        'ai-gateway',
        'rules',
        'ls',
        '--include-disabled',
        '--limit',
        '10',
        '--format',
        'json'
      );

      expect(await aiGateway(client)).toBe(0);
      expect(queries[0]).toMatchObject({
        includeDisabled: 'true',
        limit: '10',
      });
    });

    it('prints the next-page hint in the table view', async () => {
      setup();
      usePagedRules({ first: [sampleRule], c2: [] });
      client.setArgv('ai-gateway', 'rules', 'ls');

      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput(
        '  Next page:\n    vercel ai-gateway rules ls --next=c2\n'
      );
      expect(await exitCodePromise).toBe(0);
    });

    it('reports the end of the list when --next returns nothing', async () => {
      setup();
      usePagedRules({ first: [sampleRule], c2: [] });
      client.setArgv('ai-gateway', 'rules', 'ls', '--next', 'c2');

      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput('No more rules.');
      expect(await exitCodePromise).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain(
        'No routing rules found'
      );
    });

    it('treats a response without nextCursor as the last page', async () => {
      setup();
      client.scenario.get('/ai-gateway/rules', (_req, res) => {
        res.json({ rules: [sampleRule] });
      });
      client.setArgv('ai-gateway', 'rules', 'ls', '--format', 'json');

      expect(await aiGateway(client)).toBe(0);
      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.pagination).toEqual({ next: null });
    });

    it('prints no hint when the response has no nextCursor', async () => {
      setup();
      client.scenario.get('/ai-gateway/rules', (_req, res) => {
        res.json({ rules: [sampleRule] });
      });
      client.setArgv('ai-gateway', 'rules', 'ls');

      const exitCodePromise = aiGateway(client);
      await expect(client.stdout).toOutput('rule_1');
      expect(await exitCodePromise).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('Next page:');
    });

    it('tracks --limit and a redacted --next', async () => {
      setup();
      usePagedRules({ first: [sampleRule], c2: [] });
      client.setArgv(
        'ai-gateway',
        'rules',
        'ls',
        '--limit',
        '5',
        '--next',
        'c2',
        '--format',
        'json'
      );

      expect(await aiGateway(client)).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:rules', value: 'rules' },
        { key: 'subcommand:list', value: 'ls' },
        { key: 'option:limit', value: '5' },
        { key: 'option:next', value: '[REDACTED]' },
        { key: 'option:format', value: 'json' },
      ]);
    });

    it('rejects an out-of-range --limit', async () => {
      setup();
      client.setArgv('ai-gateway', 'rules', 'ls', '--limit', '101');

      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput(
        'The --limit option must be an integer from 1 to 100.'
      );
      expect(await exitCodePromise).toBe(1);
    });
  });
});
