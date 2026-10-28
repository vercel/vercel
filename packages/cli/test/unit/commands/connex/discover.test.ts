import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import connect from '../../../../src/commands/connex';

const SLACK = {
  service: 'slack',
  name: 'Slack',
  description: 'Post messages and respond to events in Slack',
  categories: ['communication'],
  connectionMethods: [{ connectionMethod: 'oauth' }],
  targets: [{ target: 'api', label: 'API' }],
  managed: true,
  supportsTriggers: true,
  icon: 'data:image/svg+xml,...',
};

const NOTION = {
  service: 'notion',
  name: 'Notion',
  categories: ['productivity'],
  connectionMethods: [
    { connectionMethod: 'oauth' },
    { connectionMethod: 'mcp' },
  ],
  supportsTriggers: false,
};

function mockServices(
  services: unknown[],
  next: string | null = null
): { url: string } {
  const seen = { url: '' };
  client.scenario.get('/v1/connect/services', (req, res) => {
    seen.url = req.url ?? '';
    res.json({ services, pagination: { next } });
  });
  return seen;
}

function searchParams(url: string): URLSearchParams {
  return new URL(url, 'https://api.vercel.com').searchParams;
}

describe('connect discover', () => {
  beforeEach(() => {
    client.reset();
    useUser();
    const team = useTeam('team_test');
    client.config.currentTeam = team.id;
  });

  it('lists services with the default limit', async () => {
    const seen = mockServices([NOTION, SLACK]);
    client.setArgv('connect', 'discover');

    expect(await connect(client)).toBe(0);

    const params = searchParams(seen.url);
    expect(params.get('limit')).toBe('50');
    expect(params.has('query')).toBe(false);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Slack (slack)');
    expect(stderr).toContain('Notion (notion)');
    expect(stderr).toContain('Methods: oauth, mcp');
    expect(stderr).not.toContain('Features');
    expect(stderr).toContain('connect create <service>');
    expect(stderr).not.toContain('Next page');
  });

  it('passes the query and every filter to the API', async () => {
    const seen = mockServices([SLACK]);
    client.setArgv(
      'connect',
      'discover',
      'chat',
      '--category',
      'communication',
      '--category',
      'ai,data',
      '--connection-method',
      'oauth',
      '--target',
      'mcp',
      '--supports-triggers',
      '--limit',
      '10'
    );

    expect(await connect(client)).toBe(0);

    const params = searchParams(seen.url);
    expect(params.get('query')).toBe('chat');
    expect(params.get('category')).toBe('communication,ai,data');
    expect(params.get('connectionMethod')).toBe('oauth');
    expect(params.get('target')).toBe('mcp');
    expect(params.get('supportsTriggers')).toBe('true');
    expect(params.get('limit')).toBe('10');
  });

  it('omits boolean filters that are not set', async () => {
    const seen = mockServices([SLACK]);
    client.setArgv('connect', 'discover');

    await connect(client);

    const params = searchParams(seen.url);
    expect(params.has('supportsTriggers')).toBe(false);
  });

  it('forwards --next as the cursor', async () => {
    const seen = mockServices([SLACK]);
    client.setArgv('connect', 'discover', '--next', 'abc');

    await connect(client);

    expect(searchParams(seen.url).get('cursor')).toBe('abc');
  });

  it('prints a next-page command that keeps the filters', async () => {
    mockServices([SLACK], 'cursor_2');
    client.setArgv(
      'connect',
      'discover',
      'chat',
      '--supports-triggers',
      '--limit',
      '1'
    );

    expect(await connect(client)).toBe(0);

    expect(client.stderr.getFullOutput()).toContain(
      '  Next page:\n    vercel connect discover "chat" --supports-triggers --limit 1 --next cursor_2\n'
    );
  });

  it('clamps --limit to the maximum with a warning', async () => {
    const seen = mockServices([SLACK]);
    client.setArgv('connect', 'discover', '--limit', '1000');

    expect(await connect(client)).toBe(0);

    expect(searchParams(seen.url).get('limit')).toBe('500');
    expect(client.stderr.getFullOutput()).toContain('capped at 500');
  });

  it('rejects a --limit below 1', async () => {
    client.setArgv('connect', 'discover', '--limit', '0');

    expect(await connect(client)).toBe(2);
    expect(client.stderr.getFullOutput()).toContain('--limit');
  });

  it('rejects more than one query argument', async () => {
    client.setArgv('connect', 'discover', 'slack', 'notion');

    expect(await connect(client)).toBe(2);
  });

  it('says when nothing matches the query', async () => {
    mockServices([]);
    client.setArgv('connect', 'discover', 'nothing');

    expect(await connect(client)).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'No services matching "nothing" found.'
    );
  });

  it('rejects an unknown category when nothing matches', async () => {
    mockServices([]);
    client.scenario.get('/v1/connect/services/categories', (_req, res) => {
      res.json({ categories: [{ slug: 'ai', label: 'AI', count: 12 }] });
    });
    client.setArgv('connect', 'discover', '--category', 'ai,crm');

    expect(await connect(client)).toBe(2);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Unknown category: "crm"');
    expect(stderr).toContain('connect categories');
  });

  it('reports no matches when every category is known', async () => {
    mockServices([]);
    client.scenario.get('/v1/connect/services/categories', (_req, res) => {
      res.json({ categories: [{ slug: 'ai', label: 'AI', count: 12 }] });
    });
    client.setArgv('connect', 'discover', 'nothing', '--category', 'ai');

    expect(await connect(client)).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'No services matching "nothing" found.'
    );
  });

  it('outputs a stable JSON shape without icons', async () => {
    mockServices([SLACK, NOTION], 'cursor_2');
    client.setArgv('connect', 'discover', '--json');

    expect(await connect(client)).toBe(0);

    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json).toEqual({
      services: [
        {
          service: 'slack',
          name: 'Slack',
          description: 'Post messages and respond to events in Slack',
          categories: ['communication'],
          connectionMethods: ['oauth'],
          targets: ['api'],
          supportsTriggers: true,
          beta: false,
          website: null,
          docsite: null,
        },
        {
          service: 'notion',
          name: 'Notion',
          description: null,
          categories: ['productivity'],
          connectionMethods: ['oauth', 'mcp'],
          targets: [],
          supportsTriggers: false,
          beta: false,
          website: null,
          docsite: null,
        },
      ],
      pagination: { next: 'cursor_2' },
    });
  });

  it('returns 1 when the API fails', async () => {
    client.scenario.get('/v1/connect/services', (_req, res) => {
      res.status(500).json({ error: { code: 'internal', message: 'boom' } });
    });
    client.setArgv('connect', 'discover');

    expect(await connect(client)).toBe(1);
  });

  it('tracks telemetry without leaking the query or categories', async () => {
    mockServices([SLACK]);
    client.setArgv(
      'connect',
      'discover',
      'my-secret-project',
      '--category',
      'ai',
      '--connection-method',
      'mcp',
      '--supports-triggers'
    );

    await connect(client);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:discover', value: 'discover' },
      { key: 'argument:query', value: '[REDACTED]' },
      { key: 'option:category', value: '[REDACTED]' },
      { key: 'option:connection-method', value: 'mcp' },
      { key: 'flag:supports-triggers', value: 'TRUE' },
    ]);
  });
});

describe('connect categories', () => {
  beforeEach(() => {
    client.reset();
    useUser();
    const team = useTeam('team_test');
    client.config.currentTeam = team.id;
    client.scenario.get('/v1/connect/services/categories', (_req, res) => {
      res.json({
        categories: [
          { slug: 'ai', label: 'AI', count: 12 },
          { slug: 'communication', label: 'Communication', count: 30 },
        ],
      });
    });
  });

  it('lists categories with their service counts', async () => {
    client.setArgv('connect', 'categories');

    expect(await connect(client)).toBe(0);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('communication');
    expect(stderr).toContain('Communication');
    expect(stderr).toContain('30');
    expect(stderr).toContain('connect discover --category <slug>');
  });

  it('outputs JSON', async () => {
    client.setArgv('connect', 'categories', '--json');

    expect(await connect(client)).toBe(0);

    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      categories: [
        { slug: 'ai', label: 'AI', count: 12 },
        { slug: 'communication', label: 'Communication', count: 30 },
      ],
    });
  });

  it('rejects positional arguments', async () => {
    client.setArgv('connect', 'categories', 'ai');

    expect(await connect(client)).toBe(2);
  });
});
