import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import connect from '../../../../src/commands/connex';

function createdNetwork(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ntw_new',
    name: 'prod',
    cidr: '10.0.0.0/16',
    status: 'create_in_progress',
    region: 'iad1',
    awsRegion: 'us-east-1',
    awsAccountId: '1234567890',
    createdAt: 1_700_000_000_000,
    teamId: 'team_test',
    ...overrides,
  };
}

describe('connex networks create', () => {
  beforeEach(() => {
    client.reset();
    useUser();
    const team = useTeam('team_test');
    client.config.currentTeam = team.id;
  });

  it('should error and skip the request when --name is missing', async () => {
    let posted = false;
    client.scenario.post('/v1/connect/networks', (_req, res) => {
      posted = true;
      res.json(createdNetwork());
    });

    client.setArgv(
      'connect',
      'networks',
      'create',
      '--region',
      'iad1',
      '--cidr',
      '10.0.0.0/16'
    );
    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(posted).toBe(false);
    expect(client.stderr.getFullOutput()).toContain('Missing network name');
  });

  it('should error when --region is missing', async () => {
    client.setArgv(
      'connect',
      'networks',
      'create',
      '--name',
      'prod',
      '--cidr',
      '10.0.0.0/16'
    );
    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Missing region');
  });

  it('should reject an invalid CIDR before any request', async () => {
    let posted = false;
    client.scenario.post('/v1/connect/networks', (_req, res) => {
      posted = true;
      res.json(createdNetwork());
    });

    client.setArgv(
      'connect',
      'networks',
      'create',
      '--name',
      'prod',
      '--region',
      'iad1',
      '--cidr',
      'not-a-cidr'
    );
    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(posted).toBe(false);
    expect(client.stderr.getFullOutput()).toContain('not valid');
  });

  it('should reject a non-private CIDR range', async () => {
    client.setArgv(
      'connect',
      'networks',
      'create',
      '--name',
      'prod',
      '--region',
      'iad1',
      '--cidr',
      '8.8.0.0/16'
    );
    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'private (RFC 1918) address range'
    );
  });

  it('should reject a prefix length outside /16 through /24', async () => {
    client.setArgv(
      'connect',
      'networks',
      'create',
      '--name',
      'prod',
      '--region',
      'iad1',
      '--cidr',
      '10.0.0.0/25'
    );
    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('/16 through /24');
  });

  it('should require exactly two Availability Zone IDs when specified', async () => {
    client.setArgv(
      'connect',
      'networks',
      'create',
      '--name',
      'prod',
      '--region',
      'iad1',
      '--cidr',
      '10.0.0.0/16',
      '--availability-zone-id',
      'use1-az1'
    );
    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'exactly two `--availability-zone-id`'
    );
  });

  it('should POST name/region/cidr and report success', async () => {
    let body: Record<string, unknown> = {};
    client.scenario.post('/v1/connect/networks', (req, res) => {
      body = req.body;
      res.statusCode = 201;
      res.json(createdNetwork());
    });

    client.setArgv(
      'connect',
      'networks',
      'create',
      '--name',
      'prod',
      '--region',
      'iad1',
      '--cidr',
      '10.0.0.0/16'
    );
    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(body).toEqual({ name: 'prod', region: 'iad1', cidr: '10.0.0.0/16' });
    expect(body).not.toHaveProperty('awsAvailabilityZoneIds');
    expect(client.stderr.getFullOutput()).toContain('created');
  });

  it('should include awsAvailabilityZoneIds when two are provided', async () => {
    let body: Record<string, unknown> = {};
    client.scenario.post('/v1/connect/networks', (req, res) => {
      body = req.body;
      res.statusCode = 201;
      res.json(createdNetwork());
    });

    client.setArgv(
      'connect',
      'networks',
      'create',
      '--name',
      'prod',
      '--region',
      'iad1',
      '--cidr',
      '10.0.0.0/16',
      '--availability-zone-id',
      'use1-az1',
      '--availability-zone-id',
      'use1-az2'
    );
    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(body.awsAvailabilityZoneIds).toEqual(['use1-az1', 'use1-az2']);
  });

  it('should output JSON for the created network', async () => {
    client.scenario.post('/v1/connect/networks', (_req, res) => {
      res.statusCode = 201;
      res.json(createdNetwork());
    });

    client.setArgv(
      'connect',
      'networks',
      'create',
      '--name',
      'prod',
      '--region',
      'iad1',
      '--cidr',
      '10.0.0.0/16',
      '--json'
    );
    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput().trim());
    expect(parsed.id).toBe('ntw_new');
    expect(parsed.status).toBe('create_in_progress');
  });
});
