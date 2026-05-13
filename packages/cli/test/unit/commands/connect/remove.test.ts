import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import connect from '../../../../src/commands/connect';

describe('connect remove', () => {
  let team: { id: string; slug: string };

  beforeEach(() => {
    client.reset();
    useUser();
    team = useTeam();
    client.config.currentTeam = team.id;
  });

  it('should error when no client argument is provided', async () => {
    client.setArgv('connect', 'remove');

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Missing connector ID or UID'
    );
  });

  it('should error with a friendly message when the client is not found', async () => {
    client.scenario.get('/v1/connex/clients/:clientId', (_req, res) => {
      res.statusCode = 404;
      res.json({ error: { code: 'not_found', message: 'Not Found' } });
    });

    client.setArgv('connect', 'remove', 'scl_missing', '--yes');

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'No Connect connector found for'
    );
  });

  it('should delete a client with no connected projects when --yes is passed', async () => {
    let deleteCalled = false;

    client.scenario.get('/v1/connex/clients/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot', name: 'My Bot' });
    });
    client.scenario.get(
      '/v1/connex/clients/:clientId/projects',
      (_req, res) => {
        res.json({ projects: [] });
      }
    );
    client.scenario.delete('/v1/connex/clients/:clientId', (req, res) => {
      deleteCalled = true;
      expect(req.params.clientId).toBe('scl_abc123');
      res.statusCode = 200;
      res.end();
    });

    client.setArgv('connect', 'remove', 'slack/my-bot', '--yes');

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(deleteCalled).toBe(true);
    expect(client.stderr.getFullOutput()).toContain('successfully removed');
  });

  it('should refuse to delete when projects are connected and --disconnect-all is not set', async () => {
    let deleteCalled = false;

    client.scenario.get('/v1/connex/clients/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot', name: 'My Bot' });
    });
    client.scenario.get(
      '/v1/connex/clients/:clientId/projects',
      (_req, res) => {
        res.json({
          projects: [
            { clientId: 'scl_abc123', projectId: 'prj_1' },
            { clientId: 'scl_abc123', projectId: 'prj_2' },
          ],
        });
      }
    );
    client.scenario.delete('/v1/connex/clients/:clientId', (_req, res) => {
      deleteCalled = true;
      res.statusCode = 200;
      res.end();
    });

    client.setArgv('connect', 'remove', 'slack/my-bot', '--yes');

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(deleteCalled).toBe(false);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('2 connected projects');
    expect(stderr).toContain('--disconnect-all');
  });

  it('should delete with --disconnect-all + --yes when projects are connected (backend cascades)', async () => {
    let deleteCalled = false;

    client.scenario.get('/v1/connex/clients/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot', name: 'My Bot' });
    });
    client.scenario.get(
      '/v1/connex/clients/:clientId/projects',
      (_req, res) => {
        res.json({
          projects: [{ clientId: 'scl_abc123', projectId: 'prj_1' }],
        });
      }
    );
    client.scenario.delete('/v1/connex/clients/:clientId', (_req, res) => {
      deleteCalled = true;
      res.statusCode = 200;
      res.end();
    });

    client.setArgv(
      'connect',
      'remove',
      'slack/my-bot',
      '--disconnect-all',
      '--yes'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(deleteCalled).toBe(true);
    expect(client.stderr.getFullOutput()).toContain('successfully removed');
  });

  it('should require --yes when stdin is not a TTY', async () => {
    client.scenario.get('/v1/connex/clients/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot' });
    });
    client.scenario.get(
      '/v1/connex/clients/:clientId/projects',
      (_req, res) => {
        res.json({ projects: [] });
      }
    );

    client.setArgv('connect', 'remove', 'scl_abc123');
    (client.stdin as unknown as { isTTY: boolean }).isTTY = false;

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Confirmation required');
  });

  it('should cancel cleanly when the user declines the confirmation prompt', async () => {
    let deleteCalled = false;

    client.scenario.get('/v1/connex/clients/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot' });
    });
    client.scenario.get(
      '/v1/connex/clients/:clientId/projects',
      (_req, res) => {
        res.json({ projects: [] });
      }
    );
    client.scenario.delete('/v1/connex/clients/:clientId', (_req, res) => {
      deleteCalled = true;
      res.statusCode = 200;
      res.end();
    });

    client.setArgv('connect', 'remove', 'scl_abc123');

    const exitCodePromise = connect(client);

    await expect(client.stderr).toOutput('Are you sure?');
    client.stdin.write('n\n');

    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
    expect(deleteCalled).toBe(false);
    expect(client.stderr.getFullOutput()).toContain('Canceled');
  });

  it('should reject --format=json without --yes', async () => {
    client.setArgv('connect', 'remove', 'scl_abc123', '--format=json');

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      '--format=json requires --yes'
    );
  });

  it('should emit a JSON receipt on success with --format=json --yes', async () => {
    client.scenario.get('/v1/connex/clients/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot', name: 'My Bot' });
    });
    client.scenario.get(
      '/v1/connex/clients/:clientId/projects',
      (_req, res) => {
        res.json({ projects: [] });
      }
    );
    client.scenario.delete('/v1/connex/clients/:clientId', (_req, res) => {
      res.statusCode = 200;
      res.end();
    });

    client.setArgv(
      'connect',
      'remove',
      'slack/my-bot',
      '--format=json',
      '--yes'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput().trim();
    const parsed = JSON.parse(stdout);
    expect(parsed).toEqual({
      id: 'scl_abc123',
      uid: 'slack/my-bot',
      removed: true,
    });
  });

  it('should hit the API with the resolved scl_ id, not the input uid', async () => {
    let getProjectsClientId = '';
    let deleteClientId = '';

    client.scenario.get('/v1/connex/clients/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot' });
    });
    client.scenario.get('/v1/connex/clients/:clientId/projects', (req, res) => {
      getProjectsClientId = req.params.clientId;
      res.json({ projects: [] });
    });
    client.scenario.delete('/v1/connex/clients/:clientId', (req, res) => {
      deleteClientId = req.params.clientId;
      res.statusCode = 200;
      res.end();
    });

    client.setArgv('connect', 'remove', 'slack/my-bot', '--yes');

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(getProjectsClientId).toBe('scl_abc123');
    expect(deleteClientId).toBe('scl_abc123');
  });
});
