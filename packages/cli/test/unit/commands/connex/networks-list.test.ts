import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import connect from '../../../../src/commands/connex';

function readyNetwork(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ntw_abc123',
    name: 'prod-network',
    cidr: '10.0.0.0/16',
    status: 'ready',
    region: 'iad1',
    awsRegion: 'us-east-1',
    awsAccountId: '1234567890',
    createdAt: 1_700_000_000_000,
    teamId: 'team_test',
    vpcId: 'vpc-123',
    peeringConnections: { count: 2 },
    hostedZones: { count: 0 },
    projects: { count: 1, ids: ['proj_1'] },
    ...overrides,
  };
}

describe('connex networks list', () => {
  let team: { id: string; slug: string };

  beforeEach(() => {
    client.reset();
    useUser();
    team = useTeam('team_test');
    client.config.currentTeam = team.id;
  });

  it('should exit 0 and print help for `networks --help`', async () => {
    client.setArgv('connect', 'networks', '--help');
    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'Manage Secure Compute networks'
    );
  });

  it('should list networks from GET /v1/connect/networks and render a table', async () => {
    let requestUrl = '';
    client.scenario.get('/v1/connect/networks', (req, res) => {
      requestUrl = req.url ?? '';
      res.json([readyNetwork()]);
    });

    client.setArgv('connect', 'networks', 'list');
    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(requestUrl).toContain('/v1/connect/networks');
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('ntw_abc123');
    expect(stderr).toContain('prod-network');
    expect(stderr).toContain('iad1');
    expect(stderr).toContain('10.0.0.0/16');
    expect(stderr).toContain('ready');
  });

  it('should show an empty-state message when there are no networks', async () => {
    client.scenario.get('/v1/connect/networks', (_req, res) => {
      res.json([]);
    });

    client.setArgv('connect', 'networks', 'list');
    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('No networks found');
  });

  it('should forward --search as a query param', async () => {
    let requestUrl = '';
    client.scenario.get('/v1/connect/networks', (req, res) => {
      requestUrl = req.url ?? '';
      res.json([]);
    });

    client.setArgv('connect', 'networks', 'list', '--search', 'prod');
    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(requestUrl).toContain('search=prod');
  });

  it('should output JSON with a networks array and omit teamPrincipalRoleArn', async () => {
    client.scenario.get('/v1/connect/networks', (_req, res) => {
      res.json([
        readyNetwork({
          teamPrincipalRoleArn: 'arn:aws:iam::123:role/secret',
        }),
      ]);
    });

    client.setArgv('connect', 'networks', 'list', '--format=json');
    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.networks).toHaveLength(1);
    const [first] = parsed.networks;
    expect(first.id).toBe('ntw_abc123');
    expect(first.cidr).toBe('10.0.0.0/16');
    expect(first.status).toBe('ready');
    expect(first).not.toHaveProperty('teamPrincipalRoleArn');
    expect(stdout).not.toContain('secret');
  });

  it('should show a friendly error when Connect is not enabled (404)', async () => {
    client.scenario.get('/v1/connect/networks', (_req, res) => {
      res.statusCode = 404;
      res.json({ error: { code: 'not_found', message: 'Not Found' } });
    });

    client.setArgv('connect', 'networks', 'list');
    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Connect is not enabled');
  });

  it('should strip ansi escape sequences from the name cell', async () => {
    client.scenario.get('/v1/connect/networks', (_req, res) => {
      res.json([readyNetwork({ name: 'ev\x1b[2Jil' })]);
    });

    client.setArgv('connect', 'networks', 'list');
    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('evil');
    expect(stderr).not.toContain('\x1b[2J');
  });
});
