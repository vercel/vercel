import { afterEach, describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

const sampleQuota = {
  quotaEntityId: 'quota_1',
  limitAmount: 500,
  currentSpend: 42,
  currentByokSpend: 0,
  includeByokInQuota: false,
  refreshPeriod: 'monthly',
  active: true,
  archived: false,
  alertThresholds: [75, 100],
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

const sampleApiKey = {
  id: 'key_1',
  name: 'production',
  partialKey: 't7V',
  teamId: 'team_abc',
  purpose: 'ai-gateway',
  projectId: null,
  expiresAt: null,
  activeAt: 1700000000000,
  createdAt: 1700000000000,
  createdBy: 'user_1',
  leakedAt: null,
  leakedUrl: null,
  createdByAppId: null,
  quota: sampleQuota,
};

const generation = { id: 'keys-v1-g1', status: 'serving', shadow: false };

const sampleDirectoryKey = {
  schemaVersion: 1,
  keyId: 'key_1',
  teamId: 'team_abc',
  createdBy: 'user_1',
  name: 'production',
  suffix: 't7V',
  state: 'active',
  createdAt: 1700000000000,
  lastActiveAt: 1700000000000,
};

function directoryCursor(id: string) {
  return Buffer.from(
    JSON.stringify({ v: 1, fp: 'fingerprint', sa: [1700000000000, id] })
  ).toString('base64url');
}

function useListApiKeys(apiKeys: unknown[] = [sampleApiKey]) {
  let query: unknown;
  client.scenario.get('/v1/api-keys', (req, res) => {
    query = req.query;
    res.json({
      apiKeys,
      pagination: { count: apiKeys.length, next: null, prev: null },
    });
  });
  return () => query;
}

/** Serves one directory page and, by default, a budget for every key. */
function useDirectoryKeys(
  keys: unknown[] = [sampleDirectoryKey],
  { cursor = null as string | null, quotas = true } = {}
) {
  const queries: Record<string, unknown>[] = [];
  const quotaBodies: Record<string, unknown>[] = [];
  client.scenario.get('/ai-gateway/directory/keys', (req, res) => {
    queries.push(req.query as Record<string, unknown>);
    res.json({
      schemaVersion: 1,
      data: keys,
      cursor,
      complete: cursor === null,
      meta: { generation },
    });
  });
  client.scenario.post('/ai-gateway/directory/keys/quotas', (req, res) => {
    quotaBodies.push(req.body);
    if (!quotas) {
      res.status(503).json({
        error: { code: 'quotas_unavailable', message: 'nope' },
        meta: { retryable: true },
      });
      return;
    }
    res.json({
      schemaVersion: 1,
      data: {
        quotas: (req.body.keyIds as string[]).map(apiKeyId => ({
          apiKeyId,
          ...sampleQuota,
        })),
        missing: { keyIds: [] },
      },
      cursor: null,
      complete: true,
      meta: { generation },
    });
  });
  return { queries, quotaBodies };
}

// Mirrors the API: only rate limits carry Retry-After; readiness 503s do not.
function useDirectoryDown(status = 503, code = 'directory_not_ready') {
  let calls = 0;
  client.scenario.get('/ai-gateway/directory/keys', (_req, res) => {
    calls += 1;
    if (status === 429) {
      res.set('Retry-After', '60');
    }
    res
      .status(status)
      .json({ error: { code, message: 'The directory is unavailable.' } });
  });
  return () => calls;
}

// The legacy endpoint must not answer when the directory is expected to.
function useLegacyUnreachable() {
  let calls = 0;
  client.scenario.get('/v1/api-keys', (_req, res) => {
    calls += 1;
    res.status(500).json({ error: { message: 'legacy should not be called' } });
  });
  return () => calls;
}

function setup() {
  const team = useTeam();
  const user = useUser();
  client.config.currentTeam = team.id;
  return { team, user };
}

describe('ai-gateway api-keys list', () => {
  afterEach(() => {
    delete process.env.VERCEL_AI_GATEWAY_DIRECTORY;
  });

  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'api-keys', 'list', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:api-keys', value: 'api-keys' },
        { key: 'flag:help', value: 'ai-gateway api-keys:list' },
      ]);
    });
  });

  describe('served by the key directory', () => {
    it('lists API keys in a table with budgets from one batch call', async () => {
      setup();
      const { queries, quotaBodies } = useDirectoryKeys();
      const legacyCalls = useLegacyUnreachable();
      client.setArgv('ai-gateway', 'api-keys', 'list');

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput('production');
      expect(await exitCodePromise).toBe(0);
      expect(client.stdout.getFullOutput()).toContain('$500');
      expect(client.stdout.getFullOutput()).toContain('…t7V');
      expect(queries).toHaveLength(1);
      // Omitted flags keep the legacy order; `active` keeps deleted keys out.
      expect(queries[0]).toMatchObject({
        state: 'active',
        sort: 'lastActiveAt:desc',
        limit: '20',
      });
      expect(quotaBodies).toEqual([{ keyIds: ['key_1'] }]);
      expect(legacyCalls()).toBe(0);
    });

    it('keeps the legacy JSON shape', async () => {
      setup();
      useDirectoryKeys([sampleDirectoryKey], { cursor: directoryCursor('k1') });
      client.setArgv('ai-gateway', 'api-keys', 'list', '--format', 'json');

      expect(await aiGateway(client)).toBe(0);
      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.apiKeys).toEqual([sampleApiKey]);
      expect(json.pagination).toEqual({ next: directoryCursor('k1') });
    });

    it('passes --query, --creator, --state, --sort, --limit and --next', async () => {
      const { team } = setup();
      const { queries } = useDirectoryKeys();
      client.scenario.get(`/v2/teams/${team.id}/members`, (req, res) => {
        const members =
          req.query.search === 'alice@example.com'
            ? [{ uid: 'user_alice', email: 'alice@example.com' }]
            : [];
        res.json({ members, pagination: { count: members.length } });
      });
      client.setArgv(
        'ai-gateway',
        'api-keys',
        'ls',
        '--query',
        'prod',
        '--creator',
        'alice@example.com',
        '--state',
        'expired',
        '--sort',
        'name',
        '--limit',
        '5',
        '--next',
        directoryCursor('k0'),
        '--format',
        'json'
      );

      expect(await aiGateway(client)).toBe(0);
      expect(queries[0]).toMatchObject({
        search: 'prod',
        createdBy: 'user_alice',
        state: 'expired',
        sort: 'name:asc',
        limit: '5',
        cursor: directoryCursor('k0'),
      });
    });

    it('accepts --search as a hidden alias for --query', async () => {
      setup();
      const { queries } = useDirectoryKeys();
      client.setArgv('ai-gateway', 'api-keys', 'ls', '--search', 'prod');

      expect(await aiGateway(client)).toBe(0);
      expect(queries[0]).toMatchObject({ search: 'prod' });
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:api-keys', value: 'api-keys' },
        { key: 'subcommand:list', value: 'ls' },
        { key: 'option:search', value: '[REDACTED]' },
      ]);
    });

    it('keeps --search out of the help output', async () => {
      client.setArgv('ai-gateway', 'api-keys', 'list', '--help');

      expect(await aiGateway(client)).toBe(0);
      const help = client.getFullOutput();
      expect(help).toContain('--query');
      expect(help).not.toContain('--search');
    });

    it('rejects --query and --search with different values', async () => {
      setup();
      client.setArgv(
        'ai-gateway',
        'api-keys',
        'ls',
        '--query',
        'a',
        '--search',
        'b'
      );

      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput(
        'Pass only one of --query or --search.'
      );
      expect(await exitCodePromise).toBe(2);
    });

    it('resolves --creator me to the signed-in user', async () => {
      const { user } = setup();
      const { queries } = useDirectoryKeys();
      client.setArgv('ai-gateway', 'api-keys', 'ls', '--creator', 'me');

      expect(await aiGateway(client)).toBe(0);
      expect(queries[0]).toMatchObject({ createdBy: user.id });
    });

    it('fails when the team member lookup errors instead of listing nothing', async () => {
      const { team } = setup();
      const { queries } = useDirectoryKeys();
      client.scenario.get(`/v2/teams/${team.id}/members`, (_req, res) => {
        res.status(500).json({ error: { message: 'members unavailable' } });
      });
      client.setArgv(
        'ai-gateway',
        'api-keys',
        'ls',
        '--creator',
        'alice@example.com'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput(
        'Could not look up team member "alice@example.com"'
      );
      expect(await exitCodePromise).toBe(1);
      expect(queries).toEqual([]);
    });

    it('rejects an email that matches no team member', async () => {
      const { team } = setup();
      const { queries } = useDirectoryKeys();
      client.scenario.get(`/v2/teams/${team.id}/members`, (_req, res) => {
        res.json({ members: [], pagination: { count: 0 } });
      });
      client.setArgv(
        'ai-gateway',
        'api-keys',
        'ls',
        '--creator',
        'nobody@example.com'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput(
        'No team member matches "nobody@example.com".'
      );
      expect(await exitCodePromise).toBe(2);
      expect(queries).toEqual([]);
    });

    it('passes an unknown --creator through as a user id', async () => {
      const { team } = setup();
      const { queries } = useDirectoryKeys();
      client.scenario.get(`/v2/teams/${team.id}/members`, (_req, res) => {
        res.json({ members: [], pagination: { count: 0 } });
      });
      client.setArgv('ai-gateway', 'api-keys', 'ls', '--creator', 'user_gone');

      expect(await aiGateway(client)).toBe(0);
      expect(queries[0]).toMatchObject({ createdBy: 'user_gone' });
    });

    it('renders a budget outage as dashes, not a failure', async () => {
      setup();
      useDirectoryKeys([sampleDirectoryKey], { quotas: false });
      client.setArgv('ai-gateway', 'api-keys', 'list');

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput('production');
      expect(await exitCodePromise).toBe(0);
      expect(client.stdout.getFullOutput()).not.toContain('$500');
    });

    it('skips the budget call for a page of deleted keys', async () => {
      setup();
      const { quotaBodies } = useDirectoryKeys([
        { ...sampleDirectoryKey, state: 'deleted', deletedAt: 1 },
      ]);
      client.setArgv('ai-gateway', 'api-keys', 'list', '--state', 'deleted');

      expect(await aiGateway(client)).toBe(0);
      expect(quotaBodies).toEqual([]);
    });

    it('says when filters match nothing', async () => {
      setup();
      useDirectoryKeys([]);
      client.setArgv('ai-gateway', 'api-keys', 'list', '--query', 'zzz');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('No API keys match these filters.');
      expect(await exitCodePromise).toBe(0);
    });

    it('prints the next-page hint with the directory cursor', async () => {
      setup();
      useDirectoryKeys([sampleDirectoryKey], { cursor: directoryCursor('k1') });
      client.setArgv('ai-gateway', 'api-keys', 'ls', '--query', 'prod');

      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput(
        `  Next page:\n    vercel ai-gateway api-keys ls --query prod --next=${directoryCursor('k1')}\n`
      );
      expect(await exitCodePromise).toBe(0);
    });
  });

  describe('falling back to /v1/api-keys', () => {
    it('reads the canonical list when the directory has no serving generation', async () => {
      setup();
      const directoryCalls = useDirectoryDown();
      const getQuery = useListApiKeys();
      client.setArgv('ai-gateway', 'api-keys', 'list', '--query', 'prod');

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput('production');
      expect(await exitCodePromise).toBe(0);
      expect(directoryCalls()).toBe(1);
      expect(getQuery()).toMatchObject({
        purpose: 'ai-gateway',
        search: 'prod',
        limit: '20',
      });
    });

    it('falls back on a rate limit without waiting out Retry-After', async () => {
      setup();
      const directoryCalls = useDirectoryDown(429, 'rate_limited');
      useListApiKeys();
      client.setArgv('ai-gateway', 'api-keys', 'list');

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput('production');
      expect(await exitCodePromise).toBe(0);
      expect(directoryCalls()).toBe(1);
    });

    it('fails rather than dropping --creator, --state or --sort', async () => {
      setup();
      useDirectoryDown();
      const legacyCalls = useLegacyUnreachable();
      client.setArgv('ai-gateway', 'api-keys', 'list', '--state', 'active');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput(
        'The AI Gateway key directory is temporarily unavailable'
      );
      expect(await exitCodePromise).toBe(1);
      expect(legacyCalls()).toBe(0);
    });

    it('fails rather than sending a directory cursor to the canonical list', async () => {
      setup();
      useDirectoryDown();
      const legacyCalls = useLegacyUnreachable();
      client.setArgv(
        'ai-gateway',
        'api-keys',
        'list',
        '--next',
        directoryCursor('k1')
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('temporarily unavailable');
      expect(await exitCodePromise).toBe(1);
      expect(legacyCalls()).toBe(0);
    });

    it('sends a canonical cursor straight to /v1/api-keys', async () => {
      setup();
      const directoryCalls = useDirectoryDown();
      const getQuery = useListApiKeys([{ ...sampleApiKey, id: 'key_2' }]);
      client.setArgv(
        'ai-gateway',
        'api-keys',
        'ls',
        '--next',
        'c2',
        '--limit',
        '5',
        '--format',
        'json'
      );

      expect(await aiGateway(client)).toBe(0);
      expect(directoryCalls()).toBe(0);
      expect(getQuery()).toMatchObject({ until: 'c2', limit: '5' });
      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.apiKeys.map((k: { id: string }) => k.id)).toEqual(['key_2']);
      expect(json.pagination).toEqual({ next: null });
    });

    it('rejects a canonical cursor combined with directory-only filters', async () => {
      setup();
      client.setArgv(
        'ai-gateway',
        'api-keys',
        'ls',
        '--next',
        'c2',
        '--sort',
        'name'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput(
        'The --next cursor does not belong to this query.'
      );
      expect(await exitCodePromise).toBe(2);
    });

    it('honours the VERCEL_AI_GATEWAY_DIRECTORY kill switch', async () => {
      process.env.VERCEL_AI_GATEWAY_DIRECTORY = '0';
      setup();
      const directoryCalls = useDirectoryDown();
      const getQuery = useListApiKeys();
      client.setArgv('ai-gateway', 'api-keys', 'list');

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput('production');
      expect(await exitCodePromise).toBe(0);
      expect(directoryCalls()).toBe(0);
      expect(getQuery()).toMatchObject({ purpose: 'ai-gateway' });
    });

    it('refuses a directory cursor under the kill switch', async () => {
      process.env.VERCEL_AI_GATEWAY_DIRECTORY = '0';
      setup();
      client.setArgv(
        'ai-gateway',
        'api-keys',
        'list',
        '--next',
        directoryCursor('k1')
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput(
        'The --next cursor came from the AI Gateway key directory'
      );
      expect(await exitCodePromise).toBe(2);
    });

    it('explains that directory filters are off under the kill switch', async () => {
      process.env.VERCEL_AI_GATEWAY_DIRECTORY = 'false';
      setup();
      client.setArgv('ai-gateway', 'api-keys', 'list', '--creator', 'me');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('VERCEL_AI_GATEWAY_DIRECTORY');
      expect(await exitCodePromise).toBe(2);
    });
  });

  it.each([
    { metadata: { tokenPass: true }, expected: 'yes' },
    { metadata: { tokenPass: false }, expected: 'no' },
    { metadata: {}, expected: 'no' },
    { metadata: undefined, expected: 'no' },
  ])('shows token pass as $expected', async ({ metadata, expected }) => {
    const team = useTeam();
    useUser();
    useListApiKeys([{ ...sampleApiKey, metadata }]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'api-keys', 'list');

    expect(await aiGateway(client)).toBe(0);
    const lines = client.stdout.getFullOutput().trim().split('\n');
    expect(lines[0].trim().split(/\s{2,}/)).toEqual([
      'id',
      'name',
      'key',
      'token pass',
      'budget',
      'spend',
      'refresh',
      'created',
    ]);
    expect(lines[1].trim().split(/\s{2,}/)[3]).toBe(expected);
  });

  it('shows token pass as unknown when the directory served the page', async () => {
    setup();
    useDirectoryKeys();
    client.setArgv('ai-gateway', 'api-keys', 'list');

    expect(await aiGateway(client)).toBe(0);
    const lines = client.stdout.getFullOutput().trim().split('\n');
    expect(lines[0].trim().split(/\s{2,}/)).toContain('token pass');
    const row = lines[1].trim().split(/\s{2,}/);
    expect(row[3]).toBe('–');
    expect(row).not.toContain('no');
  });

  it('reports when there are no API keys', async () => {
    setup();
    useDirectoryKeys([]);
    client.setArgv('ai-gateway', 'api-keys', 'ls');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('No API keys found');
    expect(await exitCodePromise).toBe(0);
  });

  it.each([true, false])('preserves tokenPass=%s in JSON', async tokenPass => {
    const team = useTeam();
    useUser();
    useListApiKeys([{ ...sampleApiKey, metadata: { tokenPass } }]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'api-keys', 'list', '--format', 'json');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"apiKeys"');
    expect(await exitCodePromise).toBe(0);
    expect(
      JSON.parse(client.stdout.getFullOutput()).apiKeys[0].metadata.tokenPass
    ).toBe(tokenPass);
  });

  it('outputs JSON with --json', async () => {
    const team = useTeam();
    useUser();
    useListApiKeys();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'api-keys', 'list', '--json');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"apiKeys"');
    expect(await exitCodePromise).toBe(0);
  });

  it('fails without a team in non-interactive mode', async () => {
    useUser();
    client.config.currentTeam = undefined;
    client.stdin.isTTY = false;
    client.setArgv('ai-gateway', 'api-keys', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('No team selected');
    expect(await exitCodePromise).toBe(1);
  });

  describe('argument validation', () => {
    it('rejects an unknown --state', async () => {
      setup();
      client.setArgv('ai-gateway', 'api-keys', 'ls', '--state', 'purged');

      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput(
        'The --state option must be one of: active, expired, deleted, any.'
      );
      expect(await exitCodePromise).toBe(2);
    });

    it('rejects an unknown --sort', async () => {
      setup();
      client.setArgv('ai-gateway', 'api-keys', 'ls', '--sort', 'spend');

      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput('The --sort option must be one of');
      expect(await exitCodePromise).toBe(2);
    });

    it('rejects a blank --query', async () => {
      setup();
      client.setArgv('ai-gateway', 'api-keys', 'ls', '--query', '  ');

      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput(
        'The --query option requires some text.'
      );
      expect(await exitCodePromise).toBe(2);
    });

    it('does not accept --paginate', async () => {
      setup();
      client.setArgv('ai-gateway', 'api-keys', 'ls', '--paginate');

      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput('--paginate');
      expect(await exitCodePromise).toBe(2);
    });

    it('rejects an out-of-range --limit', async () => {
      setup();
      client.setArgv('ai-gateway', 'api-keys', 'ls', '--limit', '101');

      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput(
        'The --limit option must be an integer from 1 to 100.'
      );
      expect(await exitCodePromise).toBe(1);
    });
  });

  it('tracks the new options without recording their values', async () => {
    const { team } = setup();
    useDirectoryKeys();
    client.scenario.get(`/v2/teams/${team.id}/members`, (_req, res) => {
      res.json({ members: [], pagination: { count: 0 } });
    });
    client.setArgv(
      'ai-gateway',
      'api-keys',
      'ls',
      '--query',
      'secret-name',
      '--creator',
      'alice',
      '--state',
      'active',
      '--sort',
      'createdAt:asc'
    );

    expect(await aiGateway(client)).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:api-keys', value: 'api-keys' },
      { key: 'subcommand:list', value: 'ls' },
      { key: 'option:query', value: '[REDACTED]' },
      { key: 'option:creator', value: '[REDACTED]' },
      { key: 'option:state', value: 'active' },
      { key: 'option:sort', value: 'createdAt:asc' },
    ]);
  });

  it('renders the api-key default for keys without their own budget', async () => {
    setup();
    client.scenario.get('/ai-gateway/directory/keys', (_req, res) => {
      res.json({
        schemaVersion: 1,
        data: [sampleDirectoryKey],
        cursor: null,
        complete: true,
        meta: { generation },
      });
    });
    client.scenario.post('/ai-gateway/directory/keys/quotas', (_req, res) => {
      res.json({
        schemaVersion: 1,
        data: { quotas: [], missing: { keyIds: [] } },
        cursor: null,
        complete: true,
        meta: { generation },
      });
    });
    client.scenario.get('/ai-gateway/budgets/defaults/list', (_req, res) => {
      res.json({
        defaults: [
          {
            scopeType: 'api-key',
            limitAmount: 50,
            refreshPeriod: 'monthly',
            active: true,
            createdAt: 1,
            updatedAt: 2,
          },
        ],
      });
    });
    client.setArgv('ai-gateway', 'api-keys', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('$50 (default)');
    expect(await exitCodePromise).toBe(0);
  });
});
