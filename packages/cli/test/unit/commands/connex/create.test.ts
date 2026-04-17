import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import connex from '../../../../src/commands/connex';

vi.mock('open', () => ({ default: vi.fn(() => Promise.resolve()) }));
vi.setConfig({ testTimeout: 15000 });

function fakeConnexClient(overrides: Record<string, unknown> = {}) {
  return {
    id: 'scl_test123',
    ownerId: 'team_abc',
    createdAt: 0,
    updatedAt: 0,
    uid: 'uid_abc',
    type: 'slack',
    name: 'my-bot',
    data: {},
    typeName: 'Slack',
    supportedSubjectTypes: ['user'],
    supportsInstallation: false,
    ...overrides,
  };
}

describe('connex create', () => {
  let team: { id: string; slug: string };

  beforeEach(() => {
    client.reset();
    useUser();
    team = useTeam();
    client.config.currentTeam = team.id;
  });

  it('should error when no type argument is provided', async () => {
    client.setArgv('connex', 'create');

    const exitCode = await connex(client);

    await expect(client.stderr).toOutput('Missing service type');
    expect(exitCode).toBe(1);
  });

  it('should error in non-interactive mode without --name', async () => {
    client.setArgv('connex', 'create', 'slack');
    (client.stdin as any).isTTY = false;

    const exitCode = await connex(client);

    await expect(client.stderr).toOutput('Missing required flag --name');
    expect(exitCode).toBe(1);
  });

  it('should show friendly error when connex feature flag is off (404)', async () => {
    client.scenario.post('/v1/connex/clients/managed', (_req, res) => {
      res.statusCode = 404;
      res.json({ error: { code: 'not_found', message: 'Not Found' } });
    });

    client.setArgv('connex', 'create', 'slack', '--name', 'test-app');

    const exitCode = await connex(client);

    await expect(client.stderr).toOutput('Connex is not enabled');
    expect(exitCode).toBe(1);
  });

  it('should create client directly when POST succeeds (no browser)', async () => {
    let postBody: any;
    let pollHit = false;
    client.scenario.post('/v1/connex/clients/managed', (req, res) => {
      postBody = req.body;
      res.json(fakeConnexClient({ id: 'scl_direct1', uid: 'uid_direct1' }));
    });
    client.scenario.get('/v1/connex/result/:code', (_req, res) => {
      pollHit = true;
      res.json({ status: 'pending' });
    });

    client.setArgv('connex', 'create', 'slack', '--name', 'my-bot');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(postBody).toMatchObject({
      service: 'slack',
      name: 'my-bot',
    });
    expect(typeof postBody.request_code).toBe('string');
    expect(pollHit).toBe(false);
    await expect(client.stderr).toOutput('scl_direct1 (UID uid_direct1)');
  });

  it('should pass any type to the server without validation', async () => {
    let postBody: any;
    client.scenario.post('/v1/connex/clients/managed', (req, res) => {
      postBody = req.body;
      res.json(
        fakeConnexClient({ id: 'scl_jira1', type: 'jira', name: 'my-jira' })
      );
    });

    client.setArgv('connex', 'create', 'jira', '--name', 'my-jira');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(postBody.service).toBe('jira');
  });

  it('should output JSON when --format=json is used', async () => {
    client.scenario.post('/v1/connex/clients/managed', (_req, res) => {
      res.json(
        fakeConnexClient({
          id: 'scl_json123',
          uid: 'uid_json123',
          type: 'slack',
          name: 'my-bot',
          supportedSubjectTypes: ['user', 'app'],
        })
      );
    });

    client.setArgv(
      'connex',
      'create',
      'slack',
      '--name',
      'my-bot',
      '--format=json'
    );

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    await expect(client.stdout).toOutput('"id": "scl_json123"');
  });

  it('should open browser and poll when POST returns 422 with registerUrl', async () => {
    let postHits = 0;
    client.scenario.post('/v1/connex/clients/managed', (_req, res) => {
      postHits++;
      res.statusCode = 422;
      res.json({
        error: {
          code: 'registration_required',
          message: 'Registration required',
          registerUrl: 'https://vercel.com/test/~/connex/register?type=slack',
        },
      });
    });

    let pollCount = 0;
    client.scenario.get('/v1/connex/result/:code', (_req, res) => {
      pollCount++;
      if (pollCount < 2) {
        res.json({ status: 'pending' });
      } else {
        res.json({ status: 'success', data: { clientId: 'scl_after422' } });
      }
    });

    client.scenario.get('/v1/connex/clients/:id', (req, res) => {
      res.json(
        fakeConnexClient({
          id: (req.params as any).id,
          uid: 'uid_after422',
        })
      );
    });

    client.setArgv('connex', 'create', 'slack', '--name', 'my-bot');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(postHits).toBe(1);
    expect(pollCount).toBeGreaterThanOrEqual(2);
    await expect(client.stderr).toOutput('scl_after422 (UID uid_after422)');
  });

  it('should keep polling through partial status until success', async () => {
    client.scenario.post('/v1/connex/clients/managed', (_req, res) => {
      res.statusCode = 422;
      res.json({
        error: {
          message: 'Registration required',
          registerUrl: 'https://vercel.com/test/~/connex/register',
        },
      });
    });

    let pollCount = 0;
    client.scenario.get('/v1/connex/result/:code', (_req, res) => {
      pollCount++;
      if (pollCount === 1) {
        res.json({ status: 'pending' });
      } else if (pollCount === 2) {
        res.json({
          status: 'partial',
          progress: 'installing',
          data: { clientId: 'scl_partial1' },
        });
      } else {
        res.json({
          status: 'success',
          progress: 'installed',
          data: { clientId: 'scl_partial1', installationId: 'T123' },
        });
      }
    });

    client.scenario.get('/v1/connex/clients/:id', (req, res) => {
      res.json(
        fakeConnexClient({
          id: (req.params as any).id,
          uid: 'uid_partial1',
          supportsInstallation: true,
        })
      );
    });

    client.setArgv('connex', 'create', 'slack', '--name', 'my-bot');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(pollCount).toBe(3);
    await expect(client.stderr).toOutput(
      'created and installed: scl_partial1 (UID uid_partial1)'
    );
  });

  it('should handle error status from polling after 422', async () => {
    client.scenario.post('/v1/connex/clients/managed', (_req, res) => {
      res.statusCode = 422;
      res.json({
        error: {
          message: 'Registration required',
          registerUrl: 'https://vercel.com/test/~/connex/register',
        },
      });
    });

    client.scenario.get('/v1/connex/result/:code', (_req, res) => {
      res.json({
        status: 'error',
        error: { code: 'creation_failed', message: 'Slack API error' },
      });
    });

    client.setArgv('connex', 'create', 'slack', '--name', 'my-bot');

    const exitCode = await connex(client);

    await expect(client.stderr).toOutput('Slack API error');
    expect(exitCode).toBe(1);
  });

  it('should tolerate early 404s during polling after 422', async () => {
    client.scenario.post('/v1/connex/clients/managed', (_req, res) => {
      res.statusCode = 422;
      res.json({
        error: {
          message: 'Registration required',
          registerUrl: 'https://vercel.com/test/~/connex/register',
        },
      });
    });

    let pollCount = 0;
    client.scenario.get('/v1/connex/result/:code', (_req, res) => {
      pollCount++;
      if (pollCount <= 2) {
        res.statusCode = 404;
        res.json({ error: { code: 'not_found', message: 'Not Found' } });
      } else {
        res.json({ status: 'success', data: { clientId: 'scl_after404' } });
      }
    });

    client.scenario.get('/v1/connex/clients/:id', (req, res) => {
      res.json(
        fakeConnexClient({
          id: (req.params as any).id,
          uid: 'uid_after404',
        })
      );
    });

    client.setArgv('connex', 'create', 'slack', '--name', 'my-bot');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(pollCount).toBe(3);
    await expect(client.stderr).toOutput('scl_after404');
  });
});
