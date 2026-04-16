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
    useUser();
    team = useTeam();
    client.config.currentTeam = team.id;
  });

  it('should error when no clientId argument is provided', async () => {
    client.setArgv('connex', 'token');

    const exitCode = await connex(client);

    await expect(client.stderr).toOutput('Missing client ID');
    expect(exitCode).toBe(1);
  });

  it('should error with invalid --subject value', async () => {
    client.setArgv('connex', 'token', 'scl_abc', '--subject', 'invalid');

    const exitCode = await connex(client);

    await expect(client.stderr).toOutput('Invalid --subject value');
    expect(exitCode).toBe(1);
  });

  it('should return token on success', async () => {
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
    await expect(client.stdout).toOutput('xoxb-test-token-123');
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

  it('should pass scopes in request body', async () => {
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

  it('should show friendly error when connex feature flag is off (404)', async () => {
    client.scenario.post('/v1/connex/token/:clientId', (_req, res) => {
      res.statusCode = 404;
      res.json({ error: { code: 'not_found', message: 'Not Found' } });
    });

    client.setArgv('connex', 'token', 'scl_abc123');

    const exitCode = await connex(client);

    await expect(client.stderr).toOutput('Client not found');
    expect(exitCode).toBe(1);
  });

  it('should fail in non-TTY mode when auto-install is needed', async () => {
    client.scenario.post('/v1/connex/token/:clientId', (_req, res) => {
      res.statusCode = 404;
      res.json({
        error: {
          code: 'client_installation_required',
          message: 'Client installation is required',
        },
      });
    });

    client.setArgv('connex', 'token', 'scl_abc123');
    (client.stdin as any).isTTY = false;

    const exitCode = await connex(client);

    await expect(client.stderr).toOutput('install');
    expect(exitCode).toBe(1);
  });

  it('should fail in non-TTY mode when authorization is needed', async () => {
    client.scenario.post('/v1/connex/token/:clientId', (_req, res) => {
      res.statusCode = 404;
      res.json({
        error: {
          code: 'no_valid_token',
          message: 'User token is not valid',
        },
      });
    });

    client.setArgv('connex', 'token', 'scl_abc123');
    (client.stdin as any).isTTY = false;

    const exitCode = await connex(client);

    await expect(client.stderr).toOutput('authorize');
    expect(exitCode).toBe(1);
  });

  it('should auto-install when client_installation_required and --yes', async () => {
    let postCount = 0;
    client.scenario.post('/v1/connex/token/:clientId', (req, res) => {
      postCount++;
      const url = req.url ?? '';
      if (postCount === 1) {
        // First attempt: installation required
        res.statusCode = 404;
        res.json({
          error: {
            code: 'client_installation_required',
            message: 'Client installation is required',
          },
        });
      } else if (url.includes('autoinstall=true')) {
        // Second attempt: return action URL
        res.json({
          action: 'install',
          url: 'https://vercel.com/test/~/connex/install/scl_abc123',
        });
      } else {
        // Third attempt: token after install
        res.json({
          token: 'xoxb-after-install',
          expiresAt: 1712345678,
          installationId: 'inst_new',
        });
      }
    });

    let pollCount = 0;
    client.scenario.get('/v1/connex/result/:code', (_req, res) => {
      pollCount++;
      if (pollCount < 2) {
        res.json({ status: 'pending' });
      } else {
        res.json({
          status: 'success',
          data: { clientId: 'scl_abc123', installationId: 'inst_new' },
        });
      }
    });

    client.setArgv('connex', 'token', 'scl_abc123', '--yes');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(postCount).toBe(3);
    await expect(client.stdout).toOutput('xoxb-after-install');
  });

  it('should auto-authorize when no_valid_token and --yes', async () => {
    let postCount = 0;
    client.scenario.post('/v1/connex/token/:clientId', (req, res) => {
      postCount++;
      const url = req.url ?? '';
      if (postCount === 1) {
        res.statusCode = 404;
        res.json({
          error: {
            code: 'no_valid_token',
            message: 'User token is not valid',
          },
        });
      } else if (url.includes('autoinstall=true')) {
        res.json({
          action: 'authorize',
          url: 'https://vercel.com/test/~/connex/authorize/scl_abc123',
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
    expect(postCount).toBe(3);
    await expect(client.stdout).toOutput('xoxp-after-auth');
  });

  it('should handle autoinstall response that returns token directly', async () => {
    let postCount = 0;
    client.scenario.post('/v1/connex/token/:clientId', (_req, res) => {
      postCount++;
      if (postCount === 1) {
        res.statusCode = 404;
        res.json({
          error: {
            code: 'client_installation_required',
            message: 'Client installation is required',
          },
        });
      } else {
        // Autoinstall call returns a token directly
        res.json({
          token: 'xoxb-direct-token',
          expiresAt: 1712345678,
        });
      }
    });

    client.setArgv('connex', 'token', 'scl_abc123', '--yes');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(postCount).toBe(2);
    await expect(client.stdout).toOutput('xoxb-direct-token');
  });

  it('should abort when user declines the auto-install prompt', async () => {
    client.scenario.post('/v1/connex/token/:clientId', (_req, res) => {
      res.statusCode = 404;
      res.json({
        error: {
          code: 'client_installation_required',
          message: 'Client installation is required',
        },
      });
    });

    client.setArgv('connex', 'token', 'scl_abc123');

    const exitCodePromise = connex(client);

    await expect(client.stderr).toOutput('Open browser');
    client.stdin.write('n\n');

    const exitCode = await exitCodePromise;

    await expect(client.stderr).toOutput('Aborted');
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
