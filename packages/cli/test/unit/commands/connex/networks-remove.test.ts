import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import connect from '../../../../src/commands/connex';

function network(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ntw_abc123',
    name: 'prod',
    cidr: '10.0.0.0/16',
    status: 'ready',
    region: 'iad1',
    awsRegion: 'us-east-1',
    awsAccountId: '1234567890',
    createdAt: 1_700_000_000_000,
    teamId: 'team_test',
    ...overrides,
  };
}

describe('connex networks remove', () => {
  beforeEach(() => {
    client.reset();
    useUser();
    const team = useTeam('team_test');
    client.config.currentTeam = team.id;
  });

  it('should require a network ID', async () => {
    client.setArgv('connect', 'networks', 'remove');
    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Missing network ID');
  });

  it('should delete the network when --yes is passed', async () => {
    let deleteCalled = false;
    client.scenario.get('/v1/connect/networks/:id', (_req, res) => {
      res.json(network());
    });
    client.scenario.delete('/v1/connect/networks/:id', (req, res) => {
      deleteCalled = true;
      expect(req.params.id).toBe('ntw_abc123');
      res.statusCode = 204;
      res.end();
    });

    client.setArgv('connect', 'networks', 'remove', 'ntw_abc123', '--yes');
    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(deleteCalled).toBe(true);
    expect(client.stderr.getFullOutput()).toContain('successfully removed');
  });

  it('should show a not-found error when the network does not exist', async () => {
    client.scenario.get('/v1/connect/networks/:id', (_req, res) => {
      res.statusCode = 404;
      res.json({ error: { code: 'not_found', message: 'Not Found' } });
    });

    client.setArgv('connect', 'networks', 'remove', 'ntw_missing', '--yes');
    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('No network found');
  });

  it('should require --yes when stdin is not a TTY', async () => {
    let deleteCalled = false;
    client.scenario.get('/v1/connect/networks/:id', (_req, res) => {
      res.json(network());
    });
    client.scenario.delete('/v1/connect/networks/:id', (_req, res) => {
      deleteCalled = true;
      res.statusCode = 204;
      res.end();
    });

    client.setArgv('connect', 'networks', 'remove', 'ntw_abc123');
    (client.stdin as unknown as { isTTY: boolean }).isTTY = false;

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(deleteCalled).toBe(false);
    expect(client.stderr.getFullOutput()).toContain('Confirmation required');
  });

  it('should not fire DELETE when the user declines the prompt', async () => {
    let deleteCalled = false;
    client.scenario.get('/v1/connect/networks/:id', (_req, res) => {
      res.json(network());
    });
    client.scenario.delete('/v1/connect/networks/:id', (_req, res) => {
      deleteCalled = true;
      res.statusCode = 204;
      res.end();
    });

    client.setArgv('connect', 'networks', 'remove', 'ntw_abc123');

    const exitCodePromise = connect(client);
    await expect(client.stderr).toOutput('Are you sure?');
    client.stdin.write('n\n');
    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
    expect(deleteCalled).toBe(false);
    expect(client.stderr.getFullOutput()).toContain('Canceled');
  });

  it('should require --yes when using --json', async () => {
    client.setArgv('connect', 'networks', 'remove', 'ntw_abc123', '--json');
    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('--json requires --yes');
  });

  it('should output { id, removed: true } for --json --yes', async () => {
    let deleteCalled = false;
    client.scenario.get('/v1/connect/networks/:id', (_req, res) => {
      res.json(network());
    });
    client.scenario.delete('/v1/connect/networks/:id', (_req, res) => {
      deleteCalled = true;
      res.statusCode = 204;
      res.end();
    });

    client.setArgv(
      'connect',
      'networks',
      'remove',
      'ntw_abc123',
      '--json',
      '--yes'
    );
    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(deleteCalled).toBe(true);
    const parsed = JSON.parse(client.stdout.getFullOutput().trim());
    expect(parsed).toEqual({ id: 'ntw_abc123', removed: true });
  });
});
