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
    awsAvailabilityZoneIds: ['use1-az1', 'use1-az2'],
    createdAt: 1_700_000_000_000,
    teamId: 'team_test',
    vpcId: 'vpc-123',
    peeringConnections: { count: 2 },
    hostedZones: { count: 0 },
    projects: { count: 1, ids: ['proj_1'] },
    ...overrides,
  };
}

describe('connex networks inspect', () => {
  let team: { id: string; slug: string };

  beforeEach(() => {
    client.reset();
    useUser();
    team = useTeam('team_test');
    client.config.currentTeam = team.id;
  });

  it('should require a network ID argument', async () => {
    client.setArgv('connect', 'networks', 'inspect');
    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Missing network ID');
  });

  it('should fetch GET /v1/connect/networks/:id and render details', async () => {
    let requestUrl = '';
    client.scenario.get('/v1/connect/networks/ntw_abc123', (req, res) => {
      requestUrl = req.url ?? '';
      res.json(readyNetwork());
    });

    client.setArgv('connect', 'networks', 'inspect', 'ntw_abc123');
    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(requestUrl).toContain('/v1/connect/networks/ntw_abc123');
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('ntw_abc123');
    expect(stderr).toContain('prod-network');
    expect(stderr).toContain('10.0.0.0/16');
    expect(stderr).toContain('use1-az1, use1-az2');
    expect(stderr).toContain('vpc-123');
  });

  it('should output JSON and omit teamPrincipalRoleArn', async () => {
    client.scenario.get('/v1/connect/networks/ntw_abc123', (_req, res) => {
      res.json(
        readyNetwork({ teamPrincipalRoleArn: 'arn:aws:iam::123:role/secret' })
      );
    });

    client.setArgv('connect', 'networks', 'inspect', 'ntw_abc123', '--json');
    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.id).toBe('ntw_abc123');
    expect(parsed.awsAvailabilityZoneIds).toEqual(['use1-az1', 'use1-az2']);
    expect(parsed).not.toHaveProperty('teamPrincipalRoleArn');
    expect(stdout).not.toContain('secret');
  });

  it('should show a not-found error for a missing network (404)', async () => {
    client.scenario.get('/v1/connect/networks/ntw_missing', (_req, res) => {
      res.statusCode = 404;
      res.json({ error: { code: 'not_found', message: 'Not Found' } });
    });

    client.setArgv('connect', 'networks', 'inspect', 'ntw_missing');
    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('No network found');
  });
});
