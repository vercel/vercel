import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import connect from '../../../../src/commands/connex';

describe('connex networks update', () => {
  beforeEach(() => {
    client.reset();
    useUser();
    const team = useTeam('team_test');
    client.config.currentTeam = team.id;
  });

  it('should require a network ID', async () => {
    client.setArgv('connect', 'networks', 'update', '--name', 'staging');
    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Missing network ID');
  });

  it('should require --name and skip the request', async () => {
    let patched = false;
    client.scenario.patch('/v1/connect/networks/:id', (_req, res) => {
      patched = true;
      res.json({});
    });

    client.setArgv('connect', 'networks', 'update', 'ntw_abc123');
    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(patched).toBe(false);
    expect(client.stderr.getFullOutput()).toContain('Specify a new name');
  });

  it('should PATCH the new name', async () => {
    let body: Record<string, unknown> = {};
    let requestUrl = '';
    client.scenario.patch('/v1/connect/networks/:id', (req, res) => {
      body = req.body;
      requestUrl = req.url ?? '';
      res.json({
        id: 'ntw_abc123',
        name: 'staging',
        cidr: '10.0.0.0/16',
        status: 'ready',
        region: 'iad1',
        awsRegion: 'us-east-1',
        awsAccountId: '1234567890',
        createdAt: 1_700_000_000_000,
        teamId: 'team_test',
      });
    });

    client.setArgv(
      'connect',
      'networks',
      'update',
      'ntw_abc123',
      '--name',
      'staging'
    );
    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(requestUrl).toContain('/v1/connect/networks/ntw_abc123');
    expect(body).toEqual({ name: 'staging' });
    expect(client.stderr.getFullOutput()).toContain('updated');
  });

  it('should show a not-found error on 404', async () => {
    client.scenario.patch('/v1/connect/networks/:id', (_req, res) => {
      res.statusCode = 404;
      res.json({ error: { code: 'not_found', message: 'Not Found' } });
    });

    client.setArgv(
      'connect',
      'networks',
      'update',
      'ntw_missing',
      '--name',
      'staging'
    );
    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('No network found');
  });
});
