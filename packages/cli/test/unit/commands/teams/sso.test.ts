import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import teams from '../../../../src/commands/teams';
import { useUser } from '../../../mocks/user';

describe('teams sso', () => {
  beforeEach(() => {
    useUser();
  });

  it('errors when no team scope is set', async () => {
    client.config.currentTeam = undefined;
    client.setArgv('teams', 'sso');

    const exitCode = await teams(client);
    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('No team context');
  });

  it('prints human-readable output when SAML is not configured', async () => {
    const teamId = 'team_sso_plain';
    client.config.currentTeam = teamId;
    client.scenario.get(`/teams/${teamId}`, (_req, res) => {
      res.json({
        id: teamId,
        slug: 'plain-co',
        name: 'Plain Co',
      });
    });
    client.setArgv('teams', 'sso');

    const exitCode = await teams(client);
    expect(exitCode).toBe(0);
    const err = client.stderr.getFullOutput();
    expect(err).toContain('Plain Co');
    expect(err).toContain('plain-co');
    expect(err).toContain(
      'No SAML configuration on this team (or not visible to your token).'
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:sso',
        value: 'sso',
      },
    ]);
  });

  it('prints SAML details when present', async () => {
    const teamId = 'team_sso_saml';
    client.config.currentTeam = teamId;
    client.scenario.get(`/teams/${teamId}`, (_req, res) => {
      res.json({
        id: teamId,
        slug: 'acme',
        name: 'Acme',
        saml: { enforced: true, connection: { state: 'active' } },
      });
    });
    client.setArgv('teams', 'sso');

    const exitCode = await teams(client);
    expect(exitCode).toBe(0);
    const err = client.stderr.getFullOutput();
    expect(err).toContain('SAML enforced:');
    expect(err).toContain('true');
    expect(err).toContain('Connection state:');
    expect(err).toContain('active');
  });

  it('outputs valid JSON with --format json', async () => {
    const teamId = 'team_sso_json';
    client.config.currentTeam = teamId;
    client.scenario.get(`/teams/${teamId}`, (_req, res) => {
      res.json({
        id: teamId,
        slug: 'json-co',
        name: 'JSON Co',
        saml: { enforced: false },
      });
    });
    client.setArgv('teams', 'sso', '--format', 'json');

    const exitCode = await teams(client);
    expect(exitCode).toBe(0);
    const output = client.stdout.getFullOutput();
    const jsonOutput = JSON.parse(output);
    expect(jsonOutput.teamId).toBe(teamId);
    expect(jsonOutput.slug).toBe('json-co');
    expect(jsonOutput.name).toBe('JSON Co');
    expect(jsonOutput.saml).toEqual({ enforced: false });
  });
});
