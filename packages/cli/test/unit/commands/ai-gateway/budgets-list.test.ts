import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam, createTeam } from '../../../mocks/team';
import { useProject, defaultProject } from '../../../mocks/project';

const teamBudget = {
  quotaEntityId: 'team_abc',
  scopeType: 'team',
  scopeId: 'team_abc',
  limitAmount: 500,
  currentSpend: 120.5,
  currentByokSpend: 0,
  includeByokInQuota: false,
  refreshPeriod: 'monthly',
  active: true,
  archived: false,
  createdAt: 1,
  updatedAt: 2,
};

const projectBudget = {
  ...teamBudget,
  quotaEntityId: 'prj_123',
  scopeType: 'project',
  scopeId: 'prj_123',
  limitAmount: 200,
};

const userBudget = {
  ...teamBudget,
  // The gateway prefixes the user scope id; the members roster returns it bare.
  quotaEntityId: 'usr_member',
  scopeType: 'user',
  scopeId: 'usr_member',
  limitAmount: 100,
};

const apiKeyBudget = {
  ...teamBudget,
  quotaEntityId: 'api_key_id_key_123',
  scopeType: 'api-key',
  scopeId: 'key_123',
  limitAmount: 50,
};

// Mirrors the API: a paged request (limit or cursor) honors
// includeDefaultCovered and carries counts across the full list.
function useListBudgets(
  budgets: ({ source?: string; scopeType: string } & Record<
    string,
    unknown
  >)[] = [teamBudget, projectBudget]
) {
  let query: unknown;
  client.scenario.get('/ai-gateway/budgets/list', (req, res) => {
    query = req.query;
    if (req.query.limit === undefined && req.query.cursor === undefined) {
      res.json({ budgets });
      return;
    }
    const defaultCoveredCounts = { team: 0, project: 0, user: 0, 'api-key': 0 };
    for (const budget of budgets) {
      if (budget.source === 'default') {
        defaultCoveredCounts[
          budget.scopeType as keyof typeof defaultCoveredCounts
        ] += 1;
      }
    }
    res.json({
      budgets:
        req.query.includeDefaultCovered === 'false'
          ? budgets.filter(budget => budget.source !== 'default')
          : budgets,
      nextCursor: null,
      defaultCoveredCounts,
    });
  });
  return () => query;
}

function defaultRow(
  scopeType: string,
  limitAmount: number,
  refreshPeriod: string
) {
  return {
    scopeType,
    limitAmount,
    refreshPeriod,
    active: true,
    createdAt: 1,
    updatedAt: 2,
  };
}

function useListDefaults(defaults: unknown[]) {
  client.scenario.get('/ai-gateway/budgets/defaults/list', (_req, res) => {
    res.json({ defaults });
  });
}

// Serves single-key lookups and fails the list endpoint, so a test proves the
// roster is resolved per id instead of by paging every key.
function useApiKeys(apiKeys: { id: string; name: string }[]) {
  const lookups: string[] = [];
  client.scenario.get('/v1/api-keys/:id', (req, res) => {
    lookups.push(req.params.id);
    const apiKey = apiKeys.find(k => k.id === req.params.id);
    if (!apiKey) {
      res.status(404).json({ error: { code: 'not_found', message: 'nope' } });
      return;
    }
    res.json({ apiKey });
  });
  client.scenario.get('/v1/api-keys', (_req, res) => {
    res.status(500).json({ error: { message: 'list should not be called' } });
  });
  return lookups;
}

function useTeamMembers(
  teamId: string,
  members: unknown[] = [
    { uid: 'member', email: 'teammate@example.com', username: 'teammate' },
  ]
) {
  let fetches = 0;
  client.scenario.get(`/v2/teams/${teamId}/members`, (_req, res) => {
    fetches += 1;
    res.json({ members, pagination: { count: members.length, next: null } });
  });
  return () => fetches;
}

const generation = { id: 'keys-v1-g1', status: 'serving', shadow: false };

/** Names keys and members from the key directory in one batched call. */
function useDirectoryIdentities(
  keys: { id: string; name: string }[],
  users: { uid: string; username: string }[] = []
) {
  const bodies: Record<string, unknown>[] = [];
  client.scenario.post(
    '/ai-gateway/directory/identities/resolve',
    (req, res) => {
      bodies.push(req.body);
      const keyIds: string[] = req.body.keyIds ?? [];
      const userIds: string[] = req.body.userIds ?? [];
      res.json({
        schemaVersion: 1,
        data: {
          keys: keys
            .filter(k => keyIds.includes(k.id))
            .map(k => ({
              schemaVersion: 1,
              keyId: k.id,
              teamId: 'team_abc',
              name: k.name,
              state: 'active',
              createdAt: 1,
            })),
          users: users.filter(u => userIds.includes(u.uid)),
          missing: {
            keyIds: keyIds.filter(id => !keys.some(k => k.id === id)),
            userIds: userIds.filter(id => !users.some(u => u.uid === id)),
          },
        },
        cursor: null,
        complete: true,
        meta: { generation },
      });
    }
  );
  return bodies;
}

describe('ai-gateway budgets list', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'budgets', 'list', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:budgets', value: 'budgets' },
        { key: 'flag:help', value: 'ai-gateway budgets:list' },
      ]);
    });
  });

  it('asks which team when none is selected', async () => {
    // Two teams and no personal scope (northstar), so the picker must ask and
    // the default choice is a team.
    useTeam();
    createTeam();
    useUser({ version: 'northstar' });
    useListBudgets([teamBudget]);
    client.config.currentTeam = undefined;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Which team?');
    client.stdin.write('\n');
    expect(await exitCodePromise).toBe(0);
  });

  it('resolves a project scope id to its name', async () => {
    const team = useTeam();
    useUser();
    useProject({ ...defaultProject });
    useListBudgets([{ ...projectBudget, scopeId: defaultProject.id }]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput(defaultProject.name!);
    expect(await exitCodePromise).toBe(0);
  });

  it('resolves a user scope id to a member handle', async () => {
    const team = useTeam();
    useUser();
    useTeamMembers(team.id);
    useListBudgets([userBudget]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('teammate');
    expect(await exitCodePromise).toBe(0);
  });

  it('resolves user names with one batched member lookup', async () => {
    const team = useTeam();
    useUser();
    const getFetches = useTeamMembers(team.id, [
      { uid: 'member', username: 'teammate' },
      { uid: 'member2', username: 'other' },
    ]);
    useListBudgets([
      userBudget,
      { ...userBudget, quotaEntityId: 'usr_member2', scopeId: 'usr_member2' },
    ]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('other');
    expect(await exitCodePromise).toBe(0);
    expect(getFetches()).toBe(1);
  });

  it('uses the api-provided name for an api-key scope row', async () => {
    const team = useTeam();
    useUser();
    useListBudgets([{ ...apiKeyBudget, name: 'production-key' }]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('production-key');
    expect(await exitCodePromise).toBe(0);
  });

  it('resolves an unnamed api-key scope by looking up that key', async () => {
    const team = useTeam();
    useUser();
    const lookups = useApiKeys([{ id: 'key_123', name: 'roster-key' }]);
    useListBudgets([
      apiKeyBudget,
      {
        ...apiKeyBudget,
        quotaEntityId: 'api_key_id_key_named',
        scopeId: 'key_named',
        name: 'named-key',
      },
    ]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('roster-key');
    expect(await exitCodePromise).toBe(0);
    expect(lookups).toEqual(['key_123']);
  });

  it('caps concurrent api-key name lookups', async () => {
    const team = useTeam();
    useUser();
    const keys = Array.from({ length: 10 }, (_, i) => ({
      id: `key_${i}`,
      name: `name-${i}`,
    }));
    let inFlight = 0;
    let peak = 0;
    client.scenario.get('/v1/api-keys/:id', async (req, res) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise(resolve => setTimeout(resolve, 20));
      inFlight -= 1;
      res.json({ apiKey: keys.find(k => k.id === req.params.id) });
    });
    useListBudgets(
      keys.map(k => ({
        ...apiKeyBudget,
        quotaEntityId: `api_key_id_${k.id}`,
        scopeId: k.id,
      }))
    );
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('name-9');
    expect(await exitCodePromise).toBe(0);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(5);
  });

  it('pages the key list instead of one lookup per key when many are unnamed', async () => {
    const team = useTeam();
    useUser();
    const keys = Array.from({ length: 250 }, (_, i) => ({
      id: `key_${i}`,
      name: `name-${i}`,
    }));
    const budgeted = keys.slice(0, 25);
    let idLookups = 0;
    client.scenario.get('/v1/api-keys/:id', (_req, res) => {
      idLookups += 1;
      res.status(500).json({ error: { message: 'should page instead' } });
    });
    const pageQueries: Record<string, unknown>[] = [];
    client.scenario.get('/v1/api-keys', (req, res) => {
      pageQueries.push(req.query as Record<string, unknown>);
      const start = req.query.until ? Number(req.query.until) : 0;
      const limit = Number(req.query.limit);
      const end = start + limit;
      res.json({
        apiKeys: keys.slice(start, end),
        pagination: { next: end < keys.length ? String(end) : null },
      });
    });
    useListBudgets(
      budgeted.map(k => ({
        ...apiKeyBudget,
        quotaEntityId: `api_key_id_${k.id}`,
        scopeId: k.id,
      }))
    );
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('name-24');
    expect(await exitCodePromise).toBe(0);
    expect(idLookups).toBe(0);
    expect(pageQueries).toHaveLength(1);
    expect(pageQueries[0]).toMatchObject({ limit: '100' });
  });

  it('stops paging the key list on a repeated cursor and shows ids', async () => {
    const team = useTeam();
    useUser();
    const budgeted = Array.from({ length: 25 }, (_, i) => `key_${i}`);
    let pageRequests = 0;
    client.scenario.get('/v1/api-keys', (_req, res) => {
      pageRequests += 1;
      res.json({
        apiKeys: [{ id: 'key_0', name: 'name-0' }],
        pagination: { next: 'stuck' },
      });
    });
    useListBudgets(
      budgeted.map(id => ({
        ...apiKeyBudget,
        quotaEntityId: `api_key_id_${id}`,
        scopeId: id,
      }))
    );
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('key_24');
    expect(await exitCodePromise).toBe(0);
    expect(client.stdout.getFullOutput()).toContain('name-0');
    expect(pageRequests).toBe(2);
  });

  it('names keys and members from the key directory in one call', async () => {
    const team = useTeam();
    useUser();
    const bodies = useDirectoryIdentities(
      [{ id: 'key_123', name: 'indexed-key' }],
      [{ uid: 'member', username: 'teammate' }]
    );
    const lookups = useApiKeys([]);
    const getMemberFetches = useTeamMembers(team.id, []);
    useListBudgets([apiKeyBudget, userBudget]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('indexed-key');
    expect(await exitCodePromise).toBe(0);
    expect(client.stdout.getFullOutput()).toContain('teammate');
    expect(bodies).toEqual([{ keyIds: ['key_123'], userIds: ['member'] }]);
    expect(lookups).toEqual([]);
    expect(getMemberFetches()).toBe(0);
  });

  it('never walks the key roster for ids the directory does not know', async () => {
    const team = useTeam();
    useUser();
    useDirectoryIdentities([]);
    const ghosts = Array.from({ length: 25 }, (_, i) => `key_ghost_${i}`);
    const lookups = useApiKeys([]);
    useListBudgets(
      ghosts.map(id => ({
        ...apiKeyBudget,
        quotaEntityId: `api_key_id_${id}`,
        scopeId: id,
      }))
    );
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('key_ghost_24');
    expect(await exitCodePromise).toBe(0);
    // Bounded by-id lookups; the roster endpoint would 500 the test.
    expect(lookups).toHaveLength(20);
  });

  it('resolves ids the directory does not know from the canonical store', async () => {
    const team = useTeam();
    useUser();
    useDirectoryIdentities([{ id: 'key_123', name: 'indexed-key' }]);
    const lookups = useApiKeys([{ id: 'key_fresh', name: 'fresh-key' }]);
    useTeamMembers(team.id);
    useListBudgets([
      apiKeyBudget,
      {
        ...apiKeyBudget,
        quotaEntityId: 'api_key_id_key_fresh',
        scopeId: 'key_fresh',
      },
      userBudget,
    ]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('fresh-key');
    expect(await exitCodePromise).toBe(0);
    expect(client.stdout.getFullOutput()).toContain('indexed-key');
    expect(client.stdout.getFullOutput()).toContain('teammate');
    expect(lookups).toEqual(['key_fresh']);
  });

  it('resolves a team scope id to its slug', async () => {
    const team = useTeam();
    useUser();
    useListBudgets([{ ...teamBudget, scopeId: team.id }]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput(team.slug);
    expect(await exitCodePromise).toBe(0);
  });

  it('falls back to the scope id when a name cannot be resolved', async () => {
    const team = useTeam();
    useUser();
    client.scenario.get('/v9/projects/prj_gone', (_req, res) => {
      res.statusCode = 404;
      res.json({ error: { code: 'not_found', message: 'Project not found' } });
    });
    useListBudgets([{ ...projectBudget, scopeId: 'prj_gone' }]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('prj_gone');
    expect(await exitCodePromise).toBe(0);
  });

  it('reports when there are no budgets', async () => {
    const team = useTeam();
    useUser();
    useListBudgets([]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'ls');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('No budgets found');
    expect(await exitCodePromise).toBe(0);
  });

  it('summarizes default-inherited rows instead of listing them', async () => {
    const team = useTeam();
    useUser();
    useListDefaults([
      defaultRow('project', 250, 'daily'),
      defaultRow('user', 100, 'monthly'),
    ]);
    // Inherited rows resolve no names, so a project row needs no project mock.
    useListBudgets([
      teamBudget,
      {
        ...projectBudget,
        scopeId: 'prj_inherited',
        quotaEntityId: 'prj_inherited',
        source: 'default',
      },
      {
        ...userBudget,
        scopeId: 'usr_inherited',
        quotaEntityId: 'usr_inherited',
        source: 'default',
      },
    ]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput(
      'Scopes without their own budget inherit the following defaults:'
    );
    expect(await exitCodePromise).toBe(0);
    expect(client.stdout.getFullOutput()).not.toContain('prj_inherited');
  });

  it('omits inherited rows from JSON output and counts them instead', async () => {
    const team = useTeam();
    useUser();
    useListBudgets([
      teamBudget,
      { ...projectBudget, scopeId: 'prj_inherited', source: 'default' },
    ]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list', '--format', 'json');

    expect(await aiGateway(client)).toBe(0);
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json).toEqual({
      budgets: [teamBudget],
      pagination: { next: null },
      defaultCoveredCounts: { team: 0, project: 1, user: 0, 'api-key': 0 },
    });
  });

  it('outputs JSON with --format json', async () => {
    const team = useTeam();
    useUser();
    useListBudgets();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list', '--format', 'json');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"budgets"');
    expect(await exitCodePromise).toBe(0);
  });

  it('renders active defaults as a table with applied-to counts', async () => {
    const team = useTeam();
    useUser();
    useListDefaults([defaultRow('project', 9001, 'daily')]);
    useListBudgets([
      teamBudget,
      {
        ...projectBudget,
        scopeId: 'prj_inherited',
        quotaEntityId: 'prj_inherited',
        source: 'default',
      },
    ]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'ls');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('inherit the following defaults:');
    // The whole table arrives as one chunk; toOutput only sees data emitted
    // after it subscribes, so the row is asserted in a single matcher.
    await expect(client.stderr).toOutput('$9001    daily      1 project');
    expect(await exitCodePromise).toBe(0);
  });

  it('renders a user default row with its member count', async () => {
    const team = useTeam();
    useUser();
    useListDefaults([defaultRow('user', 50, 'monthly')]);
    useListBudgets([teamBudget]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'ls');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('0 team members');
    expect(await exitCodePromise).toBe(0);
  });

  describe('pagination', () => {
    type Query = Record<string, string | undefined>;

    function usePagedBudgets(
      pages: Record<string, unknown[]>,
      defaultCoveredCounts: Record<string, number> = {}
    ) {
      const queries: Query[] = [];
      client.scenario.get('/ai-gateway/budgets/list', (req, res) => {
        const { teamId: _teamId, ...query } = req.query as Query;
        queries.push(query);
        if (query.limit === undefined && query.cursor === undefined) {
          res.json({ budgets: Object.values(pages).flat() });
          return;
        }
        const cursor = query.cursor ?? 'first';
        const cursors = Object.keys(pages);
        const budgets = (pages[cursor] ?? []).slice(0, Number(query.limit));
        res.json({
          budgets,
          nextCursor: cursors[cursors.indexOf(cursor) + 1] ?? null,
          defaultCoveredCounts: {
            team: 0,
            project: 0,
            user: 0,
            'api-key': 0,
            ...defaultCoveredCounts,
          },
        });
      });
      return queries;
    }

    function setup() {
      const team = useTeam();
      useUser();
      client.config.currentTeam = team.id;
      return team;
    }

    it('requests one page of 20 without inherited rows', async () => {
      setup();
      const queries = usePagedBudgets({ first: [teamBudget] });
      client.setArgv('ai-gateway', 'budgets', 'ls', '--format', 'json');

      expect(await aiGateway(client)).toBe(0);
      expect(queries).toHaveLength(1);
      expect(queries[0]).toEqual({
        limit: '20',
        includeDefaultCovered: 'false',
      });
    });

    it('passes --scope-type, --limit, and --next to the API', async () => {
      setup();
      useTeamMembers(client.config.currentTeam as string);
      const queries = usePagedBudgets({
        first: [teamBudget],
        c2: [userBudget],
      });
      client.setArgv(
        'ai-gateway',
        'budgets',
        'ls',
        '--scope-type',
        'user',
        '--limit',
        '5',
        '--next',
        'c2',
        '--format',
        'json'
      );

      expect(await aiGateway(client)).toBe(0);
      expect(queries[0]).toEqual({
        scopeType: 'user',
        limit: '5',
        cursor: 'c2',
        includeDefaultCovered: 'false',
      });
    });

    it('returns the page, cursor, and counts in JSON', async () => {
      setup();
      usePagedBudgets(
        { first: [teamBudget], c2: [projectBudget] },
        { project: 7 }
      );
      client.setArgv('ai-gateway', 'budgets', 'ls', '--format', 'json');

      expect(await aiGateway(client)).toBe(0);
      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json).toEqual({
        budgets: [teamBudget],
        pagination: { next: 'c2' },
        defaultCoveredCounts: { team: 0, project: 7, user: 0, 'api-key': 0 },
      });
    });

    it('reads applied-to counts from defaultCoveredCounts', async () => {
      setup();
      useListDefaults([defaultRow('project', 9001, 'daily')]);
      usePagedBudgets({ first: [teamBudget] }, { project: 42 });
      client.setArgv('ai-gateway', 'budgets', 'ls');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('$9001    daily      42 projects');
      expect(await exitCodePromise).toBe(0);
    });

    it('prints the next-page hint after the table', async () => {
      setup();
      usePagedBudgets({ first: [teamBudget], c2: [projectBudget] });
      client.setArgv('ai-gateway', 'budgets', 'ls');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput(
        'Next page:\n    vercel ai-gateway budgets ls --next=c2\n'
      );
      expect(await exitCodePromise).toBe(0);
    });

    it('shows the defaults section only on the first page', async () => {
      setup();
      let defaultsFetches = 0;
      client.scenario.get('/ai-gateway/budgets/defaults/list', (_req, res) => {
        defaultsFetches += 1;
        res.json({ defaults: [defaultRow('project', 9001, 'daily')] });
      });
      usePagedBudgets({ first: [projectBudget], c2: [teamBudget] });
      client.setArgv('ai-gateway', 'budgets', 'ls', '--next', 'c2');

      expect(await aiGateway(client)).toBe(0);
      expect(client.stdout.getFullOutput()).toContain('$500');
      const err = client.stderr.getFullOutput();
      expect(err).toContain('Custom budgets');
      expect(err).not.toContain('inherit the following defaults');
      expect(err).not.toContain('Next page:');
      expect(defaultsFetches).toBe(0);
    });

    it('says there are no more budgets on an empty later page', async () => {
      setup();
      usePagedBudgets({ first: [teamBudget], c2: [] });
      client.setArgv('ai-gateway', 'budgets', 'ls', '--next', 'c2');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('No more budgets.');
      expect(await exitCodePromise).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('No budgets found');
    });

    it('rejects an out-of-range --limit', async () => {
      setup();
      client.setArgv('ai-gateway', 'budgets', 'ls', '--limit', '101');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput(
        'The --limit option must be an integer from 1 to 100.'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('rejects --limit and --next with --defaults', async () => {
      for (const flag of [
        ['--limit', '5'],
        ['--next', 'c2'],
      ]) {
        client.reset();
        setup();
        client.setArgv('ai-gateway', 'budgets', 'ls', '--defaults', ...flag);

        expect(await aiGateway(client)).toBe(1);
        expect(client.stderr.getFullOutput()).toContain(
          'The --limit and --next options do not apply to --defaults'
        );
      }
    });

    it('reads --defaults counts from a one-row page', async () => {
      setup();
      useListDefaults([defaultRow('user', 100, 'monthly')]);
      const queries = usePagedBudgets({ first: [teamBudget] }, { user: 3 });
      client.setArgv('ai-gateway', 'budgets', 'ls', '--defaults');

      expect(await aiGateway(client)).toBe(0);
      expect(queries).toEqual([{ limit: '1', includeDefaultCovered: 'false' }]);
      expect(client.stdout.getFullOutput()).toContain('3 team members');
    });

    it('tracks --limit and a redacted --next', async () => {
      setup();
      usePagedBudgets({ first: [teamBudget], c2: [projectBudget] });
      client.setArgv(
        'ai-gateway',
        'budgets',
        'ls',
        '--limit',
        '5',
        '--next',
        'c2'
      );

      expect(await aiGateway(client)).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:budgets', value: 'budgets' },
        { key: 'subcommand:list', value: 'ls' },
        { key: 'option:limit', value: '5' },
        { key: 'option:next', value: '[REDACTED]' },
      ]);
    });
  });

  describe('--scope-type', () => {
    it('filters the budgets list to one scope', async () => {
      const team = useTeam();
      useUser();
      useTeamMembers(team.id);
      const getQuery = useListBudgets([userBudget]);
      client.config.currentTeam = team.id;
      client.setArgv('ai-gateway', 'budgets', 'ls', '--scope-type', 'user');

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput('teammate');
      expect(await exitCodePromise).toBe(0);
      expect(getQuery()).toMatchObject({ scopeType: 'user' });
    });

    it('rejects an unknown scope type', async () => {
      client.setArgv('ai-gateway', 'budgets', 'ls', '--scope-type', 'org');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('--scope-type');
      expect(await exitCodePromise).toBe(2);
    });

    it('says which scope has no budgets', async () => {
      const team = useTeam();
      useUser();
      useListBudgets([]);
      client.config.currentTeam = team.id;
      client.setArgv('ai-gateway', 'budgets', 'ls', '--scope-type', 'api-key');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('No api-key budgets found');
      expect(await exitCodePromise).toBe(0);
    });
  });

  describe('--defaults', () => {
    it('renders the default policy as the primary output', async () => {
      const team = useTeam();
      useUser();
      useListDefaults([
        defaultRow('project', 250, 'daily'),
        defaultRow('user', 100, 'monthly'),
      ]);
      useListBudgets([teamBudget]);
      client.config.currentTeam = team.id;
      client.setArgv('ai-gateway', 'budgets', 'ls', '--defaults');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('Budget defaults');
      await expect(client.stdout).toOutput('$250');
      expect(await exitCodePromise).toBe(0);
    });

    it('filters the policy with --scope-type', async () => {
      const team = useTeam();
      useUser();
      useListDefaults([
        defaultRow('project', 250, 'daily'),
        defaultRow('user', 100, 'monthly'),
      ]);
      useListBudgets([teamBudget]);
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'budgets',
        'ls',
        '--defaults',
        '--scope-type',
        'user'
      );

      const exitCode = await aiGateway(client);

      expect(exitCode).toBe(0);
      const out = client.stdout.getFullOutput();
      expect(out).toContain('$100');
      expect(out).not.toContain('$250');
    });

    it('rejects --scope-type team with --defaults', async () => {
      client.setArgv(
        'ai-gateway',
        'budgets',
        'ls',
        '--defaults',
        '--scope-type',
        'team'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput(
        'team scope does not support --default'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('outputs the policy rows with --format json', async () => {
      const team = useTeam();
      useUser();
      useListDefaults([defaultRow('user', 100, 'monthly')]);
      useListBudgets([teamBudget]);
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'budgets',
        'ls',
        '--defaults',
        '--format',
        'json'
      );

      const exitCode = await aiGateway(client);

      expect(exitCode).toBe(0);
      const out = client.stdout.getFullOutput();
      expect(out).toContain('"defaults"');
      expect(out).toContain('"scopeType": "user"');
    });

    it('points at the flag form when nothing is set', async () => {
      const team = useTeam();
      useUser();
      useListDefaults([]);
      useListBudgets([teamBudget]);
      client.config.currentTeam = team.id;
      client.setArgv('ai-gateway', 'budgets', 'ls', '--defaults');

      const exitCode = await aiGateway(client);

      expect(exitCode).toBe(0);
      const err = client.stderr.getFullOutput();
      expect(err).toContain('No budget defaults set');
      expect(err).toContain('--default');
    });
  });
});
