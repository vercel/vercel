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

describe('connex attach', () => {
  let team: { id: string; slug: string };

  beforeEach(() => {
    client.reset();
    useUser();
    team = useTeam('team_test');
    client.config.currentTeam = team.id;
    useProject({
      ...defaultProject,
      id: PROJECT_ID,
      name: PROJECT_NAME,
      customEnvironments: [
        {
          id: 'env_qa123',
          slug: 'qa',
          type: 'preview',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
  });

  it('errors when no client argument is provided', async () => {
    await setupLinkedProject(team);
    client.setArgv('connect', 'attach');

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Missing connector ID or UID'
    );
  });

  it('rejects --format=json without --yes', async () => {
    await setupLinkedProject(team);
    client.setArgv('connect', 'attach', 'scl_abc123', '--format=json');

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      '--format=json requires --yes'
    );
  });

  it('rejects an invalid --environment value', async () => {
    await setupLinkedProject(team);
    client.setArgv('connect', 'attach', 'scl_abc123', '-e', 'staging', '--yes');

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Invalid environment');
    expect(stderr).toContain('production, preview, development');
    expect(stderr).toContain('custom environment slug or ID');
  });

  it('resolves a project custom environment slug to its stable ID', async () => {
    await setupLinkedProject(team);
    let postBody: { environments?: string[] } | undefined;

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
    client.scenario.post(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (req, res) => {
        postBody = req.body;
        res.json({});
      }
    );

    client.setArgv(
      'connect',
      'attach',
      'scl_abc123',
      '-e',
      'production,qa',
      '--yes'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(postBody?.environments).toEqual(['production', 'env_qa123']);
  });

  it('accepts a stable custom environment ID belonging to the project', async () => {
    await setupLinkedProject(team);
    let postBody: { environments?: string[] } | undefined;

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
    client.scenario.post(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (req, res) => {
        postBody = req.body;
        res.json({});
      }
    );

    client.setArgv(
      'connect',
      'attach',
      'scl_abc123',
      '-e',
      'env_qa123',
      '--yes'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(postBody?.environments).toEqual(['env_qa123']);
  });

  it('deduplicates built-in names, custom slugs, and their stable IDs', async () => {
    await setupLinkedProject(team);
    let postBody: { environments?: string[] } | undefined;

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
    client.scenario.post(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (req, res) => {
        postBody = req.body;
        res.json({});
      }
    );

    client.setArgv(
      'connect',
      'attach',
      'scl_abc123',
      '-e',
      'production,qa',
      '-e',
      'env_qa123,production',
      '--yes'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(postBody?.environments).toEqual(['production', 'env_qa123']);
  });

  it('resolves a custom environment for an explicit --project', async () => {
    client.cwd = setupTmpDir();
    let postProjectId = '';
    let postBody: { environments?: string[] } | undefined;

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
    client.scenario.post(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (req, res) => {
        postProjectId = req.params.projectId;
        postBody = req.body;
        res.json({});
      }
    );

    client.setArgv(
      'connect',
      'attach',
      'scl_abc123',
      '--project',
      PROJECT_NAME,
      '-e',
      'qa',
      '--yes'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(postProjectId).toBe(PROJECT_ID);
    expect(postBody?.environments).toEqual(['env_qa123']);
  });

  it('rejects a custom environment ID belonging to another project', async () => {
    await setupLinkedProject(team);
    client.setArgv(
      'connect',
      'attach',
      'scl_abc123',
      '-e',
      'env_other_project',
      '--yes'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Invalid environment');
  });

  it('errors when no project is linked and --project is not provided', async () => {
    // Intentionally no setupLinkedProject — cwd has no .vercel/project.json.
    client.cwd = setupTmpDir();

    client.setArgv('connect', 'attach', 'scl_abc123', '--yes');

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

    client.setArgv('connect', 'attach', 'scl_missing', '--yes');

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('No connector found for');
  });

  it('attaches with --yes, defaults to all environments, and POSTs to the resolved scl_ id', async () => {
    await setupLinkedProject(team);
    let postBody: { environments?: string[] } | undefined;
    let postClientId = '';
    let postProjectId = '';

    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot', name: 'My Bot' });
    });
    client.scenario.get(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (_req, res) => {
        res.statusCode = 404;
        res.json({ error: { code: 'not_found' } });
      }
    );
    client.scenario.post(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (req, res) => {
        postClientId = req.params.clientId;
        postProjectId = req.params.projectId;
        postBody = req.body;
        res.statusCode = 200;
        res.json({ clientId: postClientId, projectId: postProjectId });
      }
    );

    client.setArgv('connect', 'attach', 'slack/my-bot', '--yes');

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(postClientId).toBe('scl_abc123');
    expect(postProjectId).toBe(PROJECT_ID);
    expect(postBody?.environments).toEqual([
      'production',
      'preview',
      'development',
    ]);
    expect(client.stderr.getFullOutput()).toContain('Attached connector');
  });

  it('parses comma-separated environments', async () => {
    await setupLinkedProject(team);
    let postBody: { environments?: string[] } | undefined;

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
    client.scenario.post(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (req, res) => {
        postBody = req.body;
        res.statusCode = 200;
        res.json({});
      }
    );

    client.setArgv(
      'connect',
      'attach',
      'scl_abc123',
      '-e',
      'production,preview',
      '--yes'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(postBody?.environments).toEqual(['production', 'preview']);
  });

  it('exits as a no-op when the project is already attached with the same environments', async () => {
    await setupLinkedProject(team);
    let postCalled = false;

    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({ id: 'scl_abc123', uid: 'slack/my-bot' });
    });
    client.scenario.get(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (_req, res) => {
        res.json({
          clientId: 'scl_abc123',
          projectId: PROJECT_ID,
          // Order intentionally different from the request to confirm
          // the comparison is set-based, not order-sensitive.
          environments: ['preview', 'production'],
        });
      }
    );
    client.scenario.post(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (_req, res) => {
        postCalled = true;
        res.statusCode = 200;
        res.json({});
      }
    );

    client.setArgv(
      'connect',
      'attach',
      'scl_abc123',
      '-e',
      'production,preview'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(postCalled).toBe(false);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('already attached');
    expect(stderr).toContain('Nothing to do');
    expect(stderr).not.toContain('Continue?');
  });

  it('emits unchanged:true JSON receipt on no-op with --yes --format=json', async () => {
    await setupLinkedProject(team);
    let postCalled = false;

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
    client.scenario.post(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (_req, res) => {
        postCalled = true;
        res.statusCode = 200;
        res.json({});
      }
    );

    client.setArgv(
      'connect',
      'attach',
      'scl_abc123',
      '-e',
      'production',
      '--yes',
      '--format=json'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(postCalled).toBe(false);
    const parsed = JSON.parse(client.stdout.getFullOutput().trim());
    expect(parsed).toEqual({
      clientId: 'scl_abc123',
      uid: 'slack/my-bot',
      projectId: PROJECT_ID,
      environments: ['production'],
      unchanged: true,
    });
  });

  it('shows a diff prompt when the attachment exists with different envs and the user accepts', async () => {
    await setupLinkedProject(team);
    let postBody: { environments?: string[] } | undefined;

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
    client.scenario.post(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (req, res) => {
        postBody = req.body;
        res.statusCode = 200;
        res.json({});
      }
    );

    client.setArgv(
      'connect',
      'attach',
      'scl_abc123',
      '-e',
      'production,preview'
    );

    const exitCodePromise = connect(client);

    await expect(client.stderr).toOutput('is already attached');
    await expect(client.stderr).toOutput('Current:  production');
    await expect(client.stderr).toOutput('Will set: production, preview');
    await expect(client.stderr).toOutput('Continue?');
    client.stdin.write('y\n');

    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
    expect(postBody?.environments).toEqual(['production', 'preview']);
  });

  it('cancels cleanly when the user declines the prompt', async () => {
    await setupLinkedProject(team);
    let postCalled = false;

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
    client.scenario.post(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (_req, res) => {
        postCalled = true;
        res.statusCode = 200;
        res.json({});
      }
    );

    client.setArgv('connect', 'attach', 'scl_abc123');

    const exitCodePromise = connect(client);

    await expect(client.stderr).toOutput('Continue?');
    client.stdin.write('n\n');

    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
    expect(postCalled).toBe(false);
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
        res.statusCode = 404;
        res.json({});
      }
    );

    client.setArgv('connect', 'attach', 'scl_abc123');
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
        res.statusCode = 404;
        res.json({});
      }
    );
    client.scenario.post(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (_req, res) => {
        res.statusCode = 200;
        res.json({});
      }
    );

    client.setArgv(
      'connect',
      'attach',
      'slack/my-bot',
      '-e',
      'production',
      '--yes',
      '--format=json'
    );

    const exitCode = await connect(client);

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
    client.scenario.post(
      '/v1/connect/connectors/:clientId/projects/:projectId',
      (_req, res) => {
        res.statusCode = 403;
        res.json({ error: { code: 'forbidden', message: 'Forbidden' } });
      }
    );

    client.setArgv('connect', 'attach', 'scl_abc123', '--yes');

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      "don't have permission to attach"
    );
  });

  describe('--triggers', () => {
    it('rejects --trigger-branch without --triggers', async () => {
      await setupLinkedProject(team);
      client.setArgv(
        'connect',
        'attach',
        'scl_abc123',
        '--trigger-branch',
        'main',
        '--yes'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        '--trigger-branch, --trigger-environment, and --trigger-path require --triggers'
      );
    });

    it('rejects --trigger-environment without --triggers', async () => {
      await setupLinkedProject(team);
      client.setArgv(
        'connect',
        'attach',
        'scl_abc123',
        '--trigger-environment',
        'qa',
        '--yes'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('--trigger-environment');
      expect(client.stderr.getFullOutput()).toContain('require --triggers');
    });

    it('rejects branch and custom-environment trigger targets together', async () => {
      await setupLinkedProject(team);
      client.setArgv(
        'connect',
        'attach',
        'scl_abc123',
        '--triggers',
        '--trigger-branch',
        'staging',
        '--trigger-environment',
        'qa',
        '--yes'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        '--trigger-branch and --trigger-environment are mutually exclusive'
      );
    });

    it('rejects an empty custom-environment target before retrieving the connector', async () => {
      await setupLinkedProject(team);
      let connectorRequested = false;
      client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
        connectorRequested = true;
        res.json({});
      });
      client.setArgv(
        'connect',
        'attach',
        'scl_abc123',
        '--triggers',
        '--trigger-environment=',
        '--yes'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(1);
      expect(connectorRequested).toBe(false);
      expect(client.stderr.getFullOutput()).toContain(
        '--trigger-environment must not be empty'
      );
    });

    it('treats an empty branch flag as mutually exclusive with a custom environment', async () => {
      await setupLinkedProject(team);
      client.setArgv(
        'connect',
        'attach',
        'scl_abc123',
        '--triggers',
        '--trigger-branch=',
        '--trigger-environment',
        'qa',
        '--yes'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        '--trigger-branch and --trigger-environment are mutually exclusive'
      );
    });

    it('errors when the connector does not support triggers', async () => {
      await setupLinkedProject(team);
      client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
        res.json({
          id: 'scl_abc123',
          uid: 'github/my-app',
          supportsTriggers: false,
        });
      });

      client.setArgv('connect', 'attach', 'scl_abc123', '--triggers', '--yes');

      const exitCode = await connect(client);

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'does not support triggers'
      );
    });

    it('attaches and registers a default trigger destination', async () => {
      await setupLinkedProject(team);
      let patchBody: { destinations: Array<{ projectId: string }> } | undefined;

      client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
        res.json({
          id: 'scl_abc123',
          uid: 'slack/my-bot',
          supportsTriggers: true,
          triggers: { enabled: true },
          triggerDestinations: [],
        });
      });
      client.scenario.get(
        '/v1/connect/connectors/:clientId/projects/:projectId',
        (_req, res) => {
          res.statusCode = 404;
          res.json({});
        }
      );
      client.scenario.post(
        '/v1/connect/connectors/:clientId/projects/:projectId',
        (_req, res) => {
          res.statusCode = 200;
          res.json({});
        }
      );
      client.scenario.patch(
        '/v1/connect/connectors/:clientId/trigger-destinations',
        (req, res) => {
          patchBody = req.body;
          res.statusCode = 200;
          res.json({});
        }
      );

      client.setArgv('connect', 'attach', 'scl_abc123', '--triggers', '--yes');

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(patchBody?.destinations).toEqual([{ projectId: PROJECT_ID }]);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Attached connector');
      expect(stderr).toContain('Registered');
      expect(stderr).toContain('trigger destination');
    });

    it('passes branch and path through to the PATCH', async () => {
      await setupLinkedProject(team);
      let patchBody:
        | {
            destinations: Array<{
              projectId: string;
              branch?: string;
              path?: string;
            }>;
          }
        | undefined;

      client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
        res.json({
          id: 'scl_abc123',
          uid: 'slack/my-bot',
          supportsTriggers: true,
          triggers: { enabled: true },
          triggerDestinations: [],
        });
      });
      client.scenario.get(
        '/v1/connect/connectors/:clientId/projects/:projectId',
        (_req, res) => {
          res.statusCode = 404;
          res.json({});
        }
      );
      client.scenario.post(
        '/v1/connect/connectors/:clientId/projects/:projectId',
        (_req, res) => {
          res.json({});
        }
      );
      client.scenario.patch(
        '/v1/connect/connectors/:clientId/trigger-destinations',
        (req, res) => {
          patchBody = req.body;
          res.json({});
        }
      );

      client.setArgv(
        'connect',
        'attach',
        'scl_abc123',
        '--triggers',
        '--trigger-branch',
        'staging',
        '--trigger-path',
        '/slack-events',
        '--yes'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(patchBody?.destinations).toEqual([
        { projectId: PROJECT_ID, branch: 'staging', path: '/slack-events' },
      ]);
    });

    it('resolves a custom-environment slug to its stable ID for the PATCH', async () => {
      await setupLinkedProject(team);
      let patchBody:
        | {
            destinations: Array<{
              projectId: string;
              customEnvironmentId?: string;
              path?: string;
            }>;
          }
        | undefined;

      client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
        res.json({
          id: 'scl_abc123',
          uid: 'slack/my-bot',
          supportsTriggers: true,
          triggers: { enabled: true },
          triggerDestinations: [],
        });
      });
      client.scenario.get(
        '/v1/connect/connectors/:clientId/projects/:projectId',
        (_req, res) => {
          res.statusCode = 404;
          res.json({});
        }
      );
      client.scenario.post(
        '/v1/connect/connectors/:clientId/projects/:projectId',
        (_req, res) => {
          res.json({});
        }
      );
      client.scenario.patch(
        '/v1/connect/connectors/:clientId/trigger-destinations',
        (req, res) => {
          patchBody = req.body;
          res.json({});
        }
      );

      client.setArgv(
        'connect',
        'attach',
        'scl_abc123',
        '--triggers',
        '--trigger-environment',
        'qa',
        '--trigger-path',
        '/slack-events',
        '--yes'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(patchBody?.destinations).toEqual([
        {
          projectId: PROJECT_ID,
          customEnvironmentId: 'env_qa123',
          path: '/slack-events',
        },
      ]);
    });

    it('accepts a stable custom-environment ID belonging to the project', async () => {
      await setupLinkedProject(team);
      let patchBody:
        | {
            destinations: Array<{
              projectId: string;
              customEnvironmentId?: string;
            }>;
          }
        | undefined;

      client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
        res.json({
          id: 'scl_abc123',
          uid: 'slack/my-bot',
          supportsTriggers: true,
          triggers: { enabled: true },
          triggerDestinations: [],
        });
      });
      client.scenario.get(
        '/v1/connect/connectors/:clientId/projects/:projectId',
        (_req, res) => {
          res.json({
            clientId: 'scl_abc123',
            projectId: PROJECT_ID,
            environments: ['production', 'preview', 'development'],
          });
        }
      );
      client.scenario.patch(
        '/v1/connect/connectors/:clientId/trigger-destinations',
        (req, res) => {
          patchBody = req.body;
          res.json({});
        }
      );

      client.setArgv(
        'connect',
        'attach',
        'scl_abc123',
        '--triggers',
        '--trigger-environment',
        'env_qa123',
        '--yes'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(patchBody?.destinations).toEqual([
        {
          projectId: PROJECT_ID,
          customEnvironmentId: 'env_qa123',
        },
      ]);
    });

    it('rejects an unknown or wrong-project custom-environment ID', async () => {
      await setupLinkedProject(team);
      let patchCalled = false;

      client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
        res.json({
          id: 'scl_abc123',
          uid: 'slack/my-bot',
          supportsTriggers: true,
          triggers: { enabled: true },
          triggerDestinations: [],
        });
      });
      client.scenario.patch(
        '/v1/connect/connectors/:clientId/trigger-destinations',
        (_req, res) => {
          patchCalled = true;
          res.json({});
        }
      );

      client.setArgv(
        'connect',
        'attach',
        'scl_abc123',
        '--triggers',
        '--trigger-environment',
        'env_other_project',
        '--yes'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(1);
      expect(patchCalled).toBe(false);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Unknown trigger environment');
      expect(stderr).toContain('env_other_project');
      expect(stderr).toContain(PROJECT_NAME);
    });

    it('merges with existing trigger destinations', async () => {
      await setupLinkedProject(team);
      let patchBody:
        | { destinations: Array<{ projectId: string; branch?: string }> }
        | undefined;

      client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
        res.json({
          id: 'scl_abc123',
          uid: 'slack/my-bot',
          supportsTriggers: true,
          triggers: { enabled: true },
          triggerDestinations: [{ projectId: 'prj_existing' }],
        });
      });
      client.scenario.get(
        '/v1/connect/connectors/:clientId/projects/:projectId',
        (_req, res) => {
          res.statusCode = 404;
          res.json({});
        }
      );
      client.scenario.post(
        '/v1/connect/connectors/:clientId/projects/:projectId',
        (_req, res) => {
          res.json({});
        }
      );
      client.scenario.patch(
        '/v1/connect/connectors/:clientId/trigger-destinations',
        (req, res) => {
          patchBody = req.body;
          res.json({});
        }
      );

      client.setArgv('connect', 'attach', 'scl_abc123', '--triggers', '--yes');

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(patchBody?.destinations).toEqual([
        { projectId: 'prj_existing' },
        { projectId: PROJECT_ID },
      ]);
    });

    it('warns but proceeds when triggers.enabled is false on the connector', async () => {
      await setupLinkedProject(team);

      client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
        res.json({
          id: 'scl_abc123',
          uid: 'slack/my-bot',
          supportsTriggers: true,
          triggers: { enabled: false },
          triggerDestinations: [],
        });
      });
      client.scenario.get(
        '/v1/connect/connectors/:clientId/projects/:projectId',
        (_req, res) => {
          res.statusCode = 404;
          res.json({});
        }
      );
      client.scenario.post(
        '/v1/connect/connectors/:clientId/projects/:projectId',
        (_req, res) => {
          res.json({});
        }
      );
      let patchCalled = false;
      client.scenario.patch(
        '/v1/connect/connectors/:clientId/trigger-destinations',
        (_req, res) => {
          patchCalled = true;
          res.json({});
        }
      );

      // Interactive flow so we see the warning text before the prompt.
      client.setArgv('connect', 'attach', 'scl_abc123', '--triggers');

      const exitCodePromise = connect(client);
      await expect(client.stderr).toOutput('Triggers are not enabled');
      await expect(client.stderr).toOutput('Continue?');
      client.stdin.write('y\n');

      const exitCode = await exitCodePromise;
      expect(exitCode).toBe(0);
      expect(patchCalled).toBe(true);
    });

    it('errors when the connector already has 3 trigger destinations', async () => {
      await setupLinkedProject(team);

      client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
        res.json({
          id: 'scl_abc123',
          uid: 'slack/my-bot',
          supportsTriggers: true,
          triggers: { enabled: true },
          triggerDestinations: [
            { projectId: 'prj_1' },
            { projectId: 'prj_2' },
            { projectId: 'prj_3' },
          ],
        });
      });

      client.setArgv('connect', 'attach', 'scl_abc123', '--triggers', '--yes');

      const exitCode = await connect(client);

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'already has 3 trigger destinations'
      );
    });

    it('no-ops the trigger PATCH when the destination is already registered', async () => {
      await setupLinkedProject(team);
      let patchCalled = false;
      let postCalled = false;

      client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
        res.json({
          id: 'scl_abc123',
          uid: 'slack/my-bot',
          supportsTriggers: true,
          triggers: { enabled: true },
          triggerDestinations: [{ projectId: PROJECT_ID }],
        });
      });
      // Attachment already exists with matching envs.
      client.scenario.get(
        '/v1/connect/connectors/:clientId/projects/:projectId',
        (_req, res) => {
          res.json({
            clientId: 'scl_abc123',
            projectId: PROJECT_ID,
            environments: ['production', 'preview', 'development'],
          });
        }
      );
      client.scenario.post(
        '/v1/connect/connectors/:clientId/projects/:projectId',
        (_req, res) => {
          postCalled = true;
          res.json({});
        }
      );
      client.scenario.patch(
        '/v1/connect/connectors/:clientId/trigger-destinations',
        (_req, res) => {
          patchCalled = true;
          res.json({});
        }
      );

      client.setArgv(
        'connect',
        'attach',
        'scl_abc123',
        '--triggers',
        '--yes',
        '--format=json'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(postCalled).toBe(false);
      expect(patchCalled).toBe(false);
      const parsed = JSON.parse(client.stdout.getFullOutput().trim());
      expect(parsed.unchanged).toBe(true);
      expect(parsed.triggerDestination).toEqual({ projectId: PROJECT_ID });
    });

    it('no-ops a repeated custom-environment trigger destination', async () => {
      await setupLinkedProject(team);
      let patchCalled = false;
      let postCalled = false;

      client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
        res.json({
          id: 'scl_abc123',
          uid: 'slack/my-bot',
          supportsTriggers: true,
          triggers: { enabled: true },
          triggerDestinations: [
            {
              projectId: PROJECT_ID,
              customEnvironmentId: 'env_qa123',
              path: '/slack-events',
            },
          ],
        });
      });
      client.scenario.get(
        '/v1/connect/connectors/:clientId/projects/:projectId',
        (_req, res) => {
          res.json({
            clientId: 'scl_abc123',
            projectId: PROJECT_ID,
            environments: ['production', 'preview', 'development', 'env_qa123'],
          });
        }
      );
      client.scenario.post(
        '/v1/connect/connectors/:clientId/projects/:projectId',
        (_req, res) => {
          postCalled = true;
          res.json({});
        }
      );
      client.scenario.patch(
        '/v1/connect/connectors/:clientId/trigger-destinations',
        (_req, res) => {
          patchCalled = true;
          res.json({});
        }
      );

      client.setArgv(
        'connect',
        'attach',
        'scl_abc123',
        '--triggers',
        '--trigger-environment',
        'env_qa123',
        '--trigger-path',
        '/slack-events',
        '--yes',
        '--format=json'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(postCalled).toBe(false);
      expect(patchCalled).toBe(false);
      const parsed = JSON.parse(client.stdout.getFullOutput().trim());
      expect(parsed.unchanged).toBe(true);
      expect(parsed.environments).toEqual([
        'production',
        'preview',
        'development',
        'env_qa123',
      ]);
      expect(parsed.triggerDestination).toEqual({
        projectId: PROJECT_ID,
        customEnvironmentId: 'env_qa123',
        path: '/slack-events',
      });
    });

    it('preserves custom environments required by existing trigger destinations when updating an attachment', async () => {
      await setupLinkedProject(team);
      let postBody: { environments?: string[] } | undefined;

      client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
        res.json({
          id: 'scl_abc123',
          uid: 'slack/my-bot',
          triggerDestinations: [
            {
              projectId: PROJECT_ID,
              customEnvironmentId: 'env_qa123',
            },
            {
              projectId: 'prj_other',
              customEnvironmentId: 'env_other',
            },
          ],
        });
      });
      client.scenario.get(
        '/v1/connect/connectors/:clientId/projects/:projectId',
        (_req, res) => {
          res.json({
            clientId: 'scl_abc123',
            projectId: PROJECT_ID,
            environments: ['production', 'env_qa123'],
          });
        }
      );
      client.scenario.post(
        '/v1/connect/connectors/:clientId/projects/:projectId',
        (req, res) => {
          postBody = req.body;
          res.json({});
        }
      );

      client.setArgv('connect', 'attach', 'scl_abc123', '-e', 'preview');

      const exitCodePromise = connect(client);

      await expect(client.stderr).toOutput('Will set: preview, env_qa123');
      await expect(client.stderr).toOutput('Continue?');
      client.stdin.write('y\n');

      const exitCode = await exitCodePromise;

      expect(exitCode).toBe(0);
      expect(postBody?.environments).toEqual(['preview', 'env_qa123']);
      expect(client.stderr.getFullOutput()).toContain(
        'for environments: preview, env_qa123'
      );
    });

    it('reports preserved trigger environments in JSON after updating an attachment', async () => {
      await setupLinkedProject(team);
      let postBody: { environments?: string[] } | undefined;

      client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
        res.json({
          id: 'scl_abc123',
          uid: 'slack/my-bot',
          triggerDestinations: [
            {
              projectId: PROJECT_ID,
              customEnvironmentId: 'env_qa123',
            },
          ],
        });
      });
      client.scenario.get(
        '/v1/connect/connectors/:clientId/projects/:projectId',
        (_req, res) => {
          res.json({
            clientId: 'scl_abc123',
            projectId: PROJECT_ID,
            environments: ['production', 'env_qa123'],
          });
        }
      );
      client.scenario.post(
        '/v1/connect/connectors/:clientId/projects/:projectId',
        (req, res) => {
          postBody = req.body;
          res.json({});
        }
      );

      client.setArgv(
        'connect',
        'attach',
        'scl_abc123',
        '-e',
        'preview',
        '--yes',
        '--format=json'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(postBody?.environments).toEqual(['preview', 'env_qa123']);
      const parsed = JSON.parse(client.stdout.getFullOutput().trim());
      expect(parsed.environments).toEqual(['preview', 'env_qa123']);
    });

    it('still PATCHes the trigger destination when attachment is unchanged but destination is new', async () => {
      await setupLinkedProject(team);
      let patchCalled = false;
      let postCalled = false;

      client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
        res.json({
          id: 'scl_abc123',
          uid: 'slack/my-bot',
          supportsTriggers: true,
          triggers: { enabled: true },
          triggerDestinations: [],
        });
      });
      client.scenario.get(
        '/v1/connect/connectors/:clientId/projects/:projectId',
        (_req, res) => {
          res.json({
            clientId: 'scl_abc123',
            projectId: PROJECT_ID,
            environments: ['production', 'preview', 'development'],
          });
        }
      );
      client.scenario.post(
        '/v1/connect/connectors/:clientId/projects/:projectId',
        (_req, res) => {
          postCalled = true;
          res.json({});
        }
      );
      client.scenario.patch(
        '/v1/connect/connectors/:clientId/trigger-destinations',
        (_req, res) => {
          patchCalled = true;
          res.json({});
        }
      );

      client.setArgv('connect', 'attach', 'scl_abc123', '--triggers', '--yes');

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(postCalled).toBe(false);
      expect(patchCalled).toBe(true);
    });
  });
});
