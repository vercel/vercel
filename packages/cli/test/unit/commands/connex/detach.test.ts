import { describe, beforeEach, expect, it } from 'vitest';
import { join } from 'path';
import { mkdirp, writeJSON } from 'fs-extra';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import connect from '../../../../src/commands/connex';

const PROJECT_ID = 'prj_linked_test';
const PROJECT_NAME = 'my-app';

async function setupLinkedProject(team: { id: string }): Promise<void> {
  const cwd = setupTmpDir();
  await mkdirp(join(cwd, '.vercel'));
  await writeJSON(join(cwd, '.vercel', 'project.json'), {
    orgId: team.id,
    projectId: PROJECT_ID,
    projectName: PROJECT_NAME,
  });
  client.cwd = cwd;
}

describe('connex detach', () => {
  let team: { id: string; slug: string };

  beforeEach(() => {
    client.reset();
    useUser();
    team = useTeam('team_test');
    client.config.currentTeam = team.id;
    useProject({ ...defaultProject, id: PROJECT_ID, name: PROJECT_NAME });
  });

  it('errors when no client argument is provided', async () => {
    await setupLinkedProject(team);
    client.setArgv('connect', 'detach');

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Missing connector ID or UID'
    );
  });

  it('rejects --format=json without --yes', async () => {
    await setupLinkedProject(team);
    client.setArgv('connect', 'detach', 'scl_abc123', '--format=json');

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      '--format=json requires --yes'
    );
  });

  it('errors when no project is linked and --project is not provided', async () => {
    client.cwd = setupTmpDir();
    client.setArgv('connect', 'detach', 'scl_abc123', '--yes');

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('No linked project found');
  });

  it('errors with a friendly message when the client is not found', async () => {
    await setupLinkedProject(team);
    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.statusCode = 404;
      res.json({ error: { code: 'not_found', message: 'Not Found' } });
    });

    client.setArgv('connect', 'detach', 'scl_missing', '--yes');

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('No connector found for');
  });

  it('exits as a no-op when the project is not attached', async () => {
    await setupLinkedProject(team);
    let deleteCalled = false;

    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot' });
    });
    client.scenario.get(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (_req, res) => {
        res.statusCode = 404;
        res.json({ error: { code: 'not_found' } });
      }
    );
    client.scenario.delete(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (_req, res) => {
        deleteCalled = true;
        res.statusCode = 200;
        res.json({});
      }
    );

    client.setArgv('connect', 'detach', 'scl_abc123');

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(deleteCalled).toBe(false);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('not attached');
    expect(stderr).toContain('Nothing to do');
    expect(stderr).not.toContain('Continue?');
  });

  it('emits unchanged:true JSON receipt on no-op with --yes --format=json', async () => {
    await setupLinkedProject(team);

    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot' });
    });
    client.scenario.get(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (_req, res) => {
        res.statusCode = 404;
        res.json({});
      }
    );

    client.setArgv('connect', 'detach', 'scl_abc123', '--yes', '--format=json');

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput().trim());
    expect(parsed).toEqual({
      clientId: 'scl_abc123',
      uid: 'slack/my-bot',
      projectId: PROJECT_ID,
      unchanged: true,
    });
  });

  it('detaches with --yes and DELETEs the resolved scl_ id', async () => {
    await setupLinkedProject(team);
    let deletedClientId = '';
    let deletedProjectId = '';

    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot', name: 'My Bot' });
    });
    client.scenario.get(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (_req, res) => {
        res.json({
          clientId: 'scl_abc123',
          projectId: PROJECT_ID,
          environments: ['production', 'preview'],
        });
      }
    );
    client.scenario.delete(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (req, res) => {
        deletedClientId = req.params.clientId;
        deletedProjectId = req.params.projectId;
        res.statusCode = 200;
        res.json({});
      }
    );

    client.setArgv('connect', 'detach', 'slack/my-bot', '--yes');

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(deletedClientId).toBe('scl_abc123');
    expect(deletedProjectId).toBe(PROJECT_ID);
    expect(client.stderr.getFullOutput()).toContain('Detached connector');
  });

  it('shows the prompt with current environments and proceeds on confirm', async () => {
    await setupLinkedProject(team);
    let deleteCalled = false;

    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot' });
    });
    client.scenario.get(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (_req, res) => {
        res.json({
          clientId: 'scl_abc123',
          projectId: PROJECT_ID,
          environments: ['production'],
        });
      }
    );
    client.scenario.delete(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (_req, res) => {
        deleteCalled = true;
        res.statusCode = 200;
        res.json({});
      }
    );

    client.setArgv('connect', 'detach', 'scl_abc123');

    const exitCodePromise = connect(client);

    await expect(client.stderr).toOutput('will be detached');
    await expect(client.stderr).toOutput('Environments: production');
    await expect(client.stderr).toOutput('Continue?');
    client.stdin.write('y\n');

    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
    expect(deleteCalled).toBe(true);
  });

  it('cancels cleanly when the user declines the prompt', async () => {
    await setupLinkedProject(team);
    let deleteCalled = false;

    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot' });
    });
    client.scenario.get(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (_req, res) => {
        res.json({
          clientId: 'scl_abc123',
          projectId: PROJECT_ID,
          environments: ['production'],
        });
      }
    );
    client.scenario.delete(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (_req, res) => {
        deleteCalled = true;
        res.statusCode = 200;
        res.json({});
      }
    );

    client.setArgv('connect', 'detach', 'scl_abc123');

    const exitCodePromise = connect(client);

    await expect(client.stderr).toOutput('Continue?');
    client.stdin.write('n\n');

    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
    expect(deleteCalled).toBe(false);
    expect(client.stderr.getFullOutput()).toContain('Canceled');
  });

  it('requires --yes when stdin is not a TTY', async () => {
    await setupLinkedProject(team);
    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot' });
    });
    client.scenario.get(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (_req, res) => {
        res.json({
          clientId: 'scl_abc123',
          projectId: PROJECT_ID,
          environments: ['production'],
        });
      }
    );

    client.setArgv('connect', 'detach', 'scl_abc123');
    (client.stdin as unknown as { isTTY: boolean }).isTTY = false;

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Confirmation required');
  });

  it('emits a JSON receipt on --yes --format=json', async () => {
    await setupLinkedProject(team);
    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot' });
    });
    client.scenario.get(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (_req, res) => {
        res.json({
          clientId: 'scl_abc123',
          projectId: PROJECT_ID,
          environments: ['production'],
        });
      }
    );
    client.scenario.delete(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (_req, res) => {
        res.statusCode = 200;
        res.json({});
      }
    );

    client.setArgv(
      'connect',
      'detach',
      'slack/my-bot',
      '--yes',
      '--format=json'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput().trim());
    expect(parsed).toEqual({
      clientId: 'scl_abc123',
      uid: 'slack/my-bot',
      projectId: PROJECT_ID,
      detached: true,
    });
  });

  it('surfaces a friendly error on 403 from the DELETE endpoint', async () => {
    await setupLinkedProject(team);
    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot' });
    });
    client.scenario.get(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (_req, res) => {
        res.json({
          clientId: 'scl_abc123',
          projectId: PROJECT_ID,
          environments: ['production'],
        });
      }
    );
    client.scenario.delete(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (_req, res) => {
        res.statusCode = 403;
        res.json({ error: { code: 'forbidden', message: 'Forbidden' } });
      }
    );

    client.setArgv('connect', 'detach', 'scl_abc123', '--yes');

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      "don't have permission to detach"
    );
  });
});
