import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import connex from '../../../../src/commands/connex';

vi.mock('open', () => ({ default: vi.fn(() => Promise.resolve()) }));

describe('connex token', () => {
  let team: { id: string; slug: string };

  beforeEach(() => {
    client.reset();
    const user = useUser();
    team = useTeam();
    client.config.currentTeam = team.id;
    client.authConfig.userId = user.id;
  });

  it('should error when no clientId argument is provided', async () => {
    client.setArgv('connex', 'token');

    const exitCode = await connex(client);

    await expect(client.stderr).toOutput('Missing client ID or UID');
    expect(exitCode).toBe(1);
  });

  it('should error with invalid --subject value', async () => {
    client.setArgv('connex', 'token', 'scl_abc', '--subject', 'invalid');

    const exitCode = await connex(client);

    await expect(client.stderr).toOutput('Invalid --subject value');
    expect(exitCode).toBe(1);
  });

  it('should print the raw token value in plain mode', async () => {
    client.scenario.post('/v1/connex/token/:clientId', (_req, res) => {
      res.json({
        token: 'xoxb-test-token-123',
        expiresAt: 1712345678,
        installationId: 'inst_1',
      });
    });

    client.setArgv('connex', 'token', 'scl_abc123');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    await expect(client.stdout).toOutput('xoxb-test-token-123\n');
  });

  it('should output JSON when --format=json is used', async () => {
    client.scenario.post('/v1/connex/token/:clientId', (_req, res) => {
      res.json({
        token: 'xoxb-json-token',
        expiresAt: 1712345678,
        name: 'My Bot',
        installationId: 'inst_1',
      });
    });

    client.setArgv('connex', 'token', 'scl_abc123', '--format=json');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    await expect(client.stdout).toOutput('"token": "xoxb-json-token"');
  });

  it('should pass subject and installationId in request body', async () => {
    let requestBody: Record<string, unknown> = {};
    client.scenario.post('/v1/connex/token/:clientId', (req, res) => {
      requestBody = req.body;
      res.json({ token: 'xoxb-app-token', expiresAt: 1712345678 });
    });

    client.setArgv(
      'connex',
      'token',
      'scl_abc123',
      '--subject',
      'app',
      '--installation-id',
      'inst_42'
    );

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(requestBody.subject).toEqual({ type: 'app' });
    expect(requestBody.installationId).toBe('inst_42');
  });

  it('should include requester userId when --subject user', async () => {
    let requestBody: Record<string, unknown> = {};
    client.scenario.post('/v1/connex/token/:clientId', (req, res) => {
      requestBody = req.body;
      res.json({ token: 'xoxp-user-token', expiresAt: 1712345678 });
    });

    client.setArgv('connex', 'token', 'scl_abc123', '--subject', 'user');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(requestBody.subject).toEqual({
      type: 'user',
      id: client.authConfig.userId,
    });
  });

  it('should omit subject when no --subject flag is provided', async () => {
    let requestBody: Record<string, unknown> = {};
    client.scenario.post('/v1/connex/token/:clientId', (req, res) => {
      requestBody = req.body;
      res.json({ token: 'xoxp-default', expiresAt: 1712345678 });
    });

    client.setArgv('connex', 'token', 'scl_abc123');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(requestBody.subject).toBeUndefined();
  });

  it('should accept comma-separated scopes', async () => {
    let requestBody: Record<string, unknown> = {};
    client.scenario.post('/v1/connex/token/:clientId', (req, res) => {
      requestBody = req.body;
      res.json({ token: 'xoxb-scoped', expiresAt: 1712345678 });
    });

    client.setArgv(
      'connex',
      'token',
      'scl_abc123',
      '--scopes',
      'chat:write,channels:read'
    );

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(requestBody.scopes).toEqual(['chat:write', 'channels:read']);
  });

  it('should accept space-separated scopes', async () => {
    let requestBody: Record<string, unknown> = {};
    client.scenario.post('/v1/connex/token/:clientId', (req, res) => {
      requestBody = req.body;
      res.json({ token: 'xoxb-scoped', expiresAt: 1712345678 });
    });

    client.setArgv(
      'connex',
      'token',
      'scl_abc123',
      '--scopes',
      'chat:write channels:read'
    );

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(requestBody.scopes).toEqual(['chat:write', 'channels:read']);
  });

  it('should show friendly error when client is not found (404)', async () => {
    client.scenario.post('/v1/connex/token/:clientId', (_req, res) => {
      res.statusCode = 404;
      res.json({ error: { code: 'not_found', message: 'Not Found' } });
    });

    client.setArgv('connex', 'token', 'scl_abc123');

    const exitCode = await connex(client);

    await expect(client.stderr).toOutput('Client not found');
    expect(exitCode).toBe(1);
  });

  it('should handle unresolved_token as terminal error', async () => {
    client.scenario.post('/v1/connex/token/:clientId', (_req, res) => {
      res.statusCode = 422;
      res.json({
        error: {
          code: 'unresolved_token',
          message: 'No token available',
        },
      });
    });

    client.setArgv('connex', 'token', 'scl_abc123');

    const exitCode = await connex(client);

    await expect(client.stderr).toOutput('does not support');
    expect(exitCode).toBe(1);
  });

  it('should fail fast and print authorize URL when stdout is not a TTY', async () => {
    client.scenario.post('/v1/connex/token/:clientId', (_req, res) => {
      res.statusCode = 422;
      res.json({
        error: {
          code: 'user_authorization_required',
          message: 'User authorization required',
        },
      });
    });

    client.setArgv('connex', 'token', 'scl_abc123');
    // Simulate `TOKEN=$(vc connex token ...)` — stdout captured, stdin is still a TTY
    (client.stdout as any).isTTY = false;

    const exitCode = await connex(client);

    await expect(client.stderr).toOutput(
      'https://vercel.com/api/v1/connex/authorize/scl_abc123'
    );
    expect(exitCode).toBe(1);
  });

  it('should fail fast and print install URL when stdin is not a TTY', async () => {
    client.scenario.post('/v1/connex/token/:clientId', (_req, res) => {
      res.statusCode = 422;
      res.json({
        error: {
          code: 'client_installation_required',
          message: 'Client installation required',
        },
      });
    });

    client.setArgv('connex', 'token', 'scl_abc123');
    (client.stdin as any).isTTY = false;

    const exitCode = await connex(client);

    await expect(client.stderr).toOutput(
      'https://vercel.com/api/v1/connex/install/scl_abc123'
    );
    expect(exitCode).toBe(1);
  });

  it('should fail fast when client.nonInteractive is true', async () => {
    client.scenario.post('/v1/connex/token/:clientId', (_req, res) => {
      res.statusCode = 422;
      res.json({
        error: {
          code: 'user_authorization_required',
          message: 'User authorization required',
        },
      });
    });

    client.nonInteractive = true;
    client.setArgv('connex', 'token', 'scl_abc123');

    const exitCode = await connex(client);

    await expect(client.stderr).toOutput(
      'https://vercel.com/api/v1/connex/authorize/scl_abc123'
    );
    expect(exitCode).toBe(1);
  });

  it('should auto-authorize when user_authorization_required and --yes', async () => {
    let postCount = 0;
    client.scenario.post('/v1/connex/token/:clientId', (_req, res) => {
      postCount++;
      if (postCount === 1) {
        res.statusCode = 422;
        res.json({
          error: {
            code: 'user_authorization_required',
            message: 'User authorization required',
          },
        });
      } else {
        res.json({
          token: 'xoxp-after-auth',
          expiresAt: 1712345678,
        });
      }
    });

    client.scenario.get('/v1/connex/result/:code', (_req, res) => {
      res.json({
        status: 'success',
        data: { clientId: 'scl_abc123' },
      });
    });

    client.setArgv('connex', 'token', 'scl_abc123', '--yes');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(postCount).toBe(2);
    await expect(client.stdout).toOutput('xoxp-after-auth');
  });

  it('should auto-install when client_installation_required and --yes, and carry forward installationId', async () => {
    let postCount = 0;
    let secondRequestBody: Record<string, unknown> = {};
    client.scenario.post('/v1/connex/token/:clientId', (req, res) => {
      postCount++;
      if (postCount === 1) {
        res.statusCode = 422;
        res.json({
          error: {
            code: 'client_installation_required',
            message: 'Client installation required',
          },
        });
      } else {
        secondRequestBody = req.body;
        res.json({
          token: 'xoxb-after-install',
          expiresAt: 1712345678,
          installationId: 'inst_new',
        });
      }
    });

    client.scenario.get('/v1/connex/result/:code', (_req, res) => {
      res.json({
        status: 'success',
        data: { clientId: 'scl_abc123', installationId: 'inst_new' },
      });
    });

    client.setArgv('connex', 'token', 'scl_abc123', '--yes');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(postCount).toBe(2);
    expect(secondRequestBody.installationId).toBe('inst_new');
    await expect(client.stdout).toOutput('xoxb-after-install');
  });

  it('should prompt in fully interactive mode and abort cleanly when user declines', async () => {
    client.scenario.post('/v1/connex/token/:clientId', (_req, res) => {
      res.statusCode = 422;
      res.json({
        error: {
          code: 'client_installation_required',
          message: 'Client installation required',
        },
      });
    });

    client.setArgv('connex', 'token', 'scl_abc123');

    const exitCodePromise = connex(client);

    await expect(client.stderr).toOutput('Open browser');
    client.stdin.write('n\n');

    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
  });

  it('should handle generic API errors', async () => {
    client.scenario.post('/v1/connex/token/:clientId', (_req, res) => {
      res.statusCode = 500;
      res.json({
        error: {
          code: 'internal_server_error',
          message: 'Something went wrong',
        },
      });
    });

    client.setArgv('connex', 'token', 'scl_abc123');

    const exitCode = await connex(client);

    await expect(client.stderr).toOutput('Something went wrong');
    expect(exitCode).toBe(1);
  });
});
