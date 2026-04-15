import { describe, expect, it } from 'vitest';
import project from '../../../../src/commands/project';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';

describe('project transfer', () => {
  const teamId = 'team_transfer_test';

  it('creates a transfer request', async () => {
    useUser();
    useTeams(teamId);
    client.config = { currentTeam: teamId };
    client.scenario.post(
      `/v1/projects/my-project/transfer-request`,
      (_req, res) => {
        res.json({ code: 'tr_123' });
      }
    );

    client.setArgv('project', 'transfer', 'request', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('tr_123');
  });

  it('accepts a transfer code with --yes', async () => {
    useUser();
    useTeams(teamId);
    client.config = { currentTeam: teamId };
    client.scenario.put(
      `/v1/projects/transfer-request/code_123`,
      (_req, res) => {
        res.json({ ok: true });
      }
    );

    client.setArgv('project', 'transfer', 'accept', 'code_123', '--yes');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('accepted');
  });

  it('preflights a transfer code', async () => {
    useUser();
    useTeams(teamId);
    client.config = { currentTeam: teamId };
    client.scenario.get(
      `/v1/projects/transfer-request/code_123/preflight`,
      (_req, res) => {
        res.json({ results: {} });
      }
    );

    client.setArgv(
      'project',
      'transfer',
      'preflight',
      'code_123',
      '--format',
      'json'
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    const out = JSON.parse(client.stdout.getFullOutput().trim());
    expect(out.action).toBe('preflight');
  });

  it('requires --yes for accept in non-interactive mode', async () => {
    useUser();
    useTeams(teamId);
    client.config = { currentTeam: teamId };
    client.nonInteractive = true;
    client.setArgv(
      'project',
      'transfer',
      'accept',
      'code_123',
      '--non-interactive'
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(1);
  });
});
