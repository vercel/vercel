import { describe, beforeEach, expect, it } from 'vitest';
import { join } from 'path';
import { mkdirp, writeJSON } from 'fs-extra';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import connex from '../../../../src/commands/connex';

const PROJECT_ID = 'prj_linked_test';
const PROJECT_NAME = 'my-app';

async function linkProjectInCwd(team: { id: string }): Promise<void> {
  const cwd = setupTmpDir();
  await mkdirp(join(cwd, '.vercel'));
  await writeJSON(join(cwd, '.vercel', 'project.json'), {
    orgId: team.id,
    projectId: PROJECT_ID,
    projectName: PROJECT_NAME,
  });
  client.cwd = cwd;
}

describe('connex link', () => {
  let team: { id: string; slug: string };

  beforeEach(() => {
    client.reset();
    useUser();
    team = useTeam('team_test');
    client.config.currentTeam = team.id;
    useProject({ ...defaultProject, id: PROJECT_ID, name: PROJECT_NAME });
  });

  it('errors when no client argument is provided', async () => {
    await linkProjectInCwd(team);
    client.setArgv('connex', 'link');

    const exitCode = await connex(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Missing client ID or UID');
  });

  it('rejects --format=json without --yes', async () => {
    await linkProjectInCwd(team);
    client.setArgv('connex', 'link', 'scl_abc123', '--format=json');

    const exitCode = await connex(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      '--format=json requires --yes'
    );
  });

  it('rejects an invalid --environment value', async () => {
    await linkProjectInCwd(team);
    client.setArgv('connex', 'link', 'scl_abc123', '-e', 'staging', '--yes');

    const exitCode = await connex(client);

    expect(exitCode).toBe(1);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Invalid environment');
    expect(stderr).toContain('production, preview, development');
  });

  it('errors when no project is linked and --project is not provided', async () => {
    // Intentionally no linkProjectInCwd — cwd has no .vercel/project.json.
    client.cwd = setupTmpDir();

    client.setArgv('connex', 'link', 'scl_abc123', '--yes');

    const exitCode = await connex(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('No linked project found');
  });

  it('errors with a friendly message when the client is not found', async () => {
    await linkProjectInCwd(team);
    client.scenario.get('/v1/connex/clients/:clientId', (_req, res) => {
      res.statusCode = 404;
      res.json({ error: { code: 'not_found', message: 'Not Found' } });
    });

    client.setArgv('connex', 'link', 'scl_missing', '--yes');

    const exitCode = await connex(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'No Connex client found for'
    );
  });

  it('links with --yes, defaults to all environments, and POSTs to the resolved scl_ id', async () => {
    await linkProjectInCwd(team);
    let postBody: { environments?: string[] } | undefined;
    let postClientId = '';
    let postProjectId = '';

    client.scenario.get('/v1/connex/clients/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot', name: 'My Bot' });
    });
    client.scenario.get(
      '/v1/connex/clients/:clientId/projects/:projectId',
      (_req, res) => {
        res.statusCode = 404;
        res.json({ error: { code: 'not_found' } });
      }
    );
    client.scenario.post(
      '/v1/connex/clients/:clientId/projects/:projectId',
      (req, res) => {
        postClientId = req.params.clientId;
        postProjectId = req.params.projectId;
        postBody = req.body;
        res.statusCode = 200;
        res.json({ clientId: postClientId, projectId: postProjectId });
      }
    );

    client.setArgv('connex', 'link', 'slack/my-bot', '--yes');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(postClientId).toBe('scl_abc123');
    expect(postProjectId).toBe(PROJECT_ID);
    expect(postBody?.environments).toEqual([
      'production',
      'preview',
      'development',
    ]);
    expect(client.stderr.getFullOutput()).toContain('Linked Connex client');
  });

  it('parses comma-separated environments', async () => {
    await linkProjectInCwd(team);
    let postBody: { environments?: string[] } | undefined;

    client.scenario.get('/v1/connex/clients/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot' });
    });
    client.scenario.get(
      '/v1/connex/clients/:clientId/projects/:projectId',
      (_req, res) => {
        res.statusCode = 404;
        res.json({ error: { code: 'not_found' } });
      }
    );
    client.scenario.post(
      '/v1/connex/clients/:clientId/projects/:projectId',
      (req, res) => {
        postBody = req.body;
        res.statusCode = 200;
        res.json({});
      }
    );

    client.setArgv(
      'connex',
      'link',
      'scl_abc123',
      '-e',
      'production,preview',
      '--yes'
    );

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(postBody?.environments).toEqual(['production', 'preview']);
  });

  it('shows a diff prompt when the link already exists and the user accepts', async () => {
    await linkProjectInCwd(team);
    let postBody: { environments?: string[] } | undefined;

    client.scenario.get('/v1/connex/clients/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot' });
    });
    client.scenario.get(
      '/v1/connex/clients/:clientId/projects/:projectId',
      (_req, res) => {
        res.json({
          clientId: 'scl_abc123',
          projectId: PROJECT_ID,
          environments: ['production'],
        });
      }
    );
    client.scenario.post(
      '/v1/connex/clients/:clientId/projects/:projectId',
      (req, res) => {
        postBody = req.body;
        res.statusCode = 200;
        res.json({});
      }
    );

    client.setArgv('connex', 'link', 'scl_abc123', '-e', 'production,preview');

    const exitCodePromise = connex(client);

    await expect(client.stderr).toOutput('is already linked');
    await expect(client.stderr).toOutput('Current:  production');
    await expect(client.stderr).toOutput('Will set: production, preview');
    await expect(client.stderr).toOutput('Continue?');
    client.stdin.write('y\n');

    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
    expect(postBody?.environments).toEqual(['production', 'preview']);
  });

  it('cancels cleanly when the user declines the prompt', async () => {
    await linkProjectInCwd(team);
    let postCalled = false;

    client.scenario.get('/v1/connex/clients/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot' });
    });
    client.scenario.get(
      '/v1/connex/clients/:clientId/projects/:projectId',
      (_req, res) => {
        res.statusCode = 404;
        res.json({});
      }
    );
    client.scenario.post(
      '/v1/connex/clients/:clientId/projects/:projectId',
      (_req, res) => {
        postCalled = true;
        res.statusCode = 200;
        res.json({});
      }
    );

    client.setArgv('connex', 'link', 'scl_abc123');

    const exitCodePromise = connex(client);

    await expect(client.stderr).toOutput('Continue?');
    client.stdin.write('n\n');

    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
    expect(postCalled).toBe(false);
    expect(client.stderr.getFullOutput()).toContain('Canceled');
  });

  it('requires --yes when stdin is not a TTY', async () => {
    await linkProjectInCwd(team);
    client.scenario.get('/v1/connex/clients/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot' });
    });
    client.scenario.get(
      '/v1/connex/clients/:clientId/projects/:projectId',
      (_req, res) => {
        res.statusCode = 404;
        res.json({});
      }
    );

    client.setArgv('connex', 'link', 'scl_abc123');
    (client.stdin as unknown as { isTTY: boolean }).isTTY = false;

    const exitCode = await connex(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Confirmation required');
  });

  it('emits a JSON receipt on --yes --format=json', async () => {
    await linkProjectInCwd(team);
    client.scenario.get('/v1/connex/clients/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot' });
    });
    client.scenario.get(
      '/v1/connex/clients/:clientId/projects/:projectId',
      (_req, res) => {
        res.statusCode = 404;
        res.json({});
      }
    );
    client.scenario.post(
      '/v1/connex/clients/:clientId/projects/:projectId',
      (_req, res) => {
        res.statusCode = 200;
        res.json({});
      }
    );

    client.setArgv(
      'connex',
      'link',
      'slack/my-bot',
      '-e',
      'production',
      '--yes',
      '--format=json'
    );

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput().trim();
    const parsed = JSON.parse(stdout);
    expect(parsed).toEqual({
      clientId: 'scl_abc123',
      uid: 'slack/my-bot',
      projectId: PROJECT_ID,
      environments: ['production'],
    });
  });

  it('surfaces a friendly error on 403 from the upsert endpoint', async () => {
    await linkProjectInCwd(team);
    client.scenario.get('/v1/connex/clients/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot' });
    });
    client.scenario.get(
      '/v1/connex/clients/:clientId/projects/:projectId',
      (_req, res) => {
        res.statusCode = 404;
        res.json({});
      }
    );
    client.scenario.post(
      '/v1/connex/clients/:clientId/projects/:projectId',
      (_req, res) => {
        res.statusCode = 403;
        res.json({ error: { code: 'forbidden', message: 'Forbidden' } });
      }
    );

    client.setArgv('connex', 'link', 'scl_abc123', '--yes');

    const exitCode = await connex(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      "don't have permission to link"
    );
  });
});
