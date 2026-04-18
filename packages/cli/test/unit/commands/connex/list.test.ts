import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import connex from '../../../../src/commands/connex';

describe('connex list', () => {
  let team: { id: string; slug: string };

  beforeEach(() => {
    client.reset();
    useUser();
    team = useTeam();
    client.config.currentTeam = team.id;
  });

  it('should render a table of clients on success', async () => {
    client.scenario.get('/v1/connex/clients', (_req, res) => {
      res.json({
        clients: [
          {
            id: 'scl_abc123',
            uid: 'slack/my-bot',
            name: 'My Bot',
            type: 'slack',
            typeName: 'Slack',
            createdAt: Date.now() - 60_000,
          },
        ],
      });
    });

    client.setArgv('connex', 'list');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('slack/my-bot');
    expect(stderr).toContain('scl_abc123');
    expect(stderr).toContain('My Bot');
    expect(stderr).toContain('Slack');
  });

  it('should show empty-state message when no clients exist', async () => {
    client.scenario.get('/v1/connex/clients', (_req, res) => {
      res.json({ clients: [] });
    });

    client.setArgv('connex', 'list');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('No Connex clients found');
  });

  it('should show friendly error when connex feature flag is off (404)', async () => {
    client.scenario.get('/v1/connex/clients', (_req, res) => {
      res.statusCode = 404;
      res.json({ error: { code: 'not_found', message: 'Not Found' } });
    });

    client.setArgv('connex', 'list');

    const exitCode = await connex(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Connex is not enabled');
  });

  it('should output JSON when --format=json is used', async () => {
    client.scenario.get('/v1/connex/clients', (_req, res) => {
      res.json({
        clients: [
          {
            id: 'scl_xyz',
            uid: 'oauth/my-client',
            name: 'My OAuth',
            type: 'oauth',
            typeName: 'OAuth',
            createdAt: 1_700_000_000_000,
          },
        ],
        cursor: 'next-page',
      });
    });

    client.setArgv('connex', 'list', '--format=json');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.cursor).toBe('next-page');
    expect(parsed.clients).toHaveLength(1);
    const [first] = parsed.clients;
    // UID should be first field in each client object
    expect(Object.keys(first)[0]).toBe('uid');
    expect(first.uid).toBe('oauth/my-client');
    expect(first.id).toBe('scl_xyz');
  });

  it('should print next-page hint when the response has a cursor', async () => {
    client.scenario.get('/v1/connex/clients', (_req, res) => {
      res.json({
        clients: [
          {
            id: 'scl_1',
            uid: 'slack/a',
            name: 'A',
            type: 'slack',
            typeName: 'Slack',
            createdAt: Date.now(),
          },
        ],
        cursor: 'cursor-abc',
      });
    });

    client.setArgv('connex', 'list');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'connex list --next cursor-abc'
    );
  });

  it('should forward --limit and --next as query params', async () => {
    let requestUrl = '';
    client.scenario.get('/v1/connex/clients', (req, res) => {
      requestUrl = req.url ?? '';
      res.json({ clients: [] });
    });

    client.setArgv('connex', 'list', '--limit', '5', '--next', 'prev-cursor');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(requestUrl).toContain('limit=5');
    expect(requestUrl).toContain('cursor=prev-cursor');
  });
});
