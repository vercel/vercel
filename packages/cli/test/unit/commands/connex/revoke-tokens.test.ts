import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import connect from '../../../../src/commands/connex';

const CONNECTOR_ID = 'scl_abc123';
const CONNECTOR_UID = 'slack/my-bot';
const CONNECTOR_NAME = 'My Bot';

const DEFAULT_REVOKE_RESULT = {
  tokensFound: 2,
  deleted: 2,
  providerRevoked: 2,
  providerSkipped: 0,
  providerFailed: 0,
};

describe('connex revoke-tokens', () => {
  beforeEach(() => {
    client.reset();
    useUser();
    const team = useTeam('team_test');
    client.config.currentTeam = team.id;
  });

  it('errors when no connector argument is provided', async () => {
    client.setArgv('connect', 'revoke-tokens');

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Missing connector ID or UID'
    );
  });

  it('errors when both --my-tokens and --all-tokens are provided', async () => {
    client.setArgv(
      'connect',
      'revoke-tokens',
      CONNECTOR_ID,
      '--my-tokens',
      '--all-tokens',
      '--yes'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      '--my-tokens and --all-tokens are mutually exclusive'
    );
  });

  it('errors when --yes is passed without a scope flag', async () => {
    client.setArgv('connect', 'revoke-tokens', CONNECTOR_ID, '--yes');

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      '--yes requires a scope flag'
    );
    expect(client.stderr.getFullOutput()).toContain('--my-tokens');
    expect(client.stderr.getFullOutput()).toContain('--all-tokens');
  });

  it('rejects --format=json without --yes', async () => {
    client.setArgv(
      'connect',
      'revoke-tokens',
      CONNECTOR_ID,
      '--my-tokens',
      '--format=json'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      '--format=json requires --yes'
    );
  });

  it('errors with a friendly message when the connector is not found', async () => {
    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.statusCode = 404;
      res.json({ error: { code: 'not_found', message: 'Not Found' } });
    });

    client.setArgv(
      'connect',
      'revoke-tokens',
      'scl_missing',
      '--my-tokens',
      '--yes'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('No connector found for');
  });

  it('errors in non-TTY when no scope flag is provided', async () => {
    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({ id: CONNECTOR_ID, uid: CONNECTOR_UID, name: CONNECTOR_NAME });
    });

    client.setArgv('connect', 'revoke-tokens', CONNECTOR_ID);
    (client.stdin as unknown as { isTTY: boolean }).isTTY = false;

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Scope required');
    expect(client.stderr.getFullOutput()).toContain('--my-tokens');
    expect(client.stderr.getFullOutput()).toContain('--all-tokens');
  });

  it('requires --yes when stdin is not a TTY', async () => {
    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({ id: CONNECTOR_ID, uid: CONNECTOR_UID, name: CONNECTOR_NAME });
    });

    client.setArgv('connect', 'revoke-tokens', CONNECTOR_ID, '--my-tokens');
    (client.stdin as unknown as { isTTY: boolean }).isTTY = false;

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Confirmation required');
  });

  it('strips ansi from the connector name in output', async () => {
    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({
        id: CONNECTOR_ID,
        uid: CONNECTOR_UID,
        name: 'Evil\x1b[2J Bot',
      });
    });
    client.scenario.delete(
      '/v1/connect/connectors/:clientId/tokens',
      (_req, res) => {
        res.json(DEFAULT_REVOKE_RESULT);
      }
    );

    client.setArgv(
      'connect',
      'revoke-tokens',
      CONNECTOR_ID,
      '--my-tokens',
      '--yes'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Evil Bot');
    expect(stderr).not.toContain('\x1b[2J');
  });

  it('revokes my tokens with --my-tokens --yes and sends the correct body', async () => {
    let requestBody: unknown;

    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({ id: CONNECTOR_ID, uid: CONNECTOR_UID, name: CONNECTOR_NAME });
    });
    client.scenario.delete(
      '/v1/connect/connectors/:clientId/tokens',
      (req, res) => {
        requestBody = req.body;
        res.json(DEFAULT_REVOKE_RESULT);
      }
    );

    client.setArgv(
      'connect',
      'revoke-tokens',
      CONNECTOR_UID,
      '--my-tokens',
      '--yes'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('Revoked your');
    expect(client.stderr.getFullOutput()).toContain(CONNECTOR_NAME);
    const body = requestBody as { subject?: { type: string; id: string } };
    expect(body.subject?.type).toBe('user');
    expect(body.subject?.id).toBeTruthy();
  });

  it('revokes all tokens with --all-tokens --yes and sends an empty body', async () => {
    let requestBody: unknown;

    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({ id: CONNECTOR_ID, uid: CONNECTOR_UID, name: CONNECTOR_NAME });
    });
    client.scenario.delete(
      '/v1/connect/connectors/:clientId/tokens',
      (req, res) => {
        requestBody = req.body;
        res.json(DEFAULT_REVOKE_RESULT);
      }
    );

    client.setArgv(
      'connect',
      'revoke-tokens',
      CONNECTOR_ID,
      '--all-tokens',
      '--yes'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('Revoked all');
    expect(client.stderr.getFullOutput()).toContain(CONNECTOR_NAME);
    expect(requestBody).toEqual({});
  });

  it('shows confirmation prompt and proceeds on confirm (--my-tokens)', async () => {
    let deleteCalled = false;

    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({ id: CONNECTOR_ID, uid: CONNECTOR_UID, name: CONNECTOR_NAME });
    });
    client.scenario.delete(
      '/v1/connect/connectors/:clientId/tokens',
      (_req, res) => {
        deleteCalled = true;
        res.json(DEFAULT_REVOKE_RESULT);
      }
    );

    client.setArgv('connect', 'revoke-tokens', CONNECTOR_ID, '--my-tokens');

    const exitCodePromise = connect(client);

    await expect(client.stderr).toOutput(
      'Tokens issued from My Bot for your account will stop working'
    );
    await expect(client.stderr).toOutput('Are you sure?');
    client.stdin.write('y\n');

    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
    expect(deleteCalled).toBe(true);
  });

  it('cancels cleanly when the user declines the prompt', async () => {
    let deleteCalled = false;

    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({ id: CONNECTOR_ID, uid: CONNECTOR_UID, name: CONNECTOR_NAME });
    });
    client.scenario.delete(
      '/v1/connect/connectors/:clientId/tokens',
      (_req, res) => {
        deleteCalled = true;
        res.json(DEFAULT_REVOKE_RESULT);
      }
    );

    client.setArgv('connect', 'revoke-tokens', CONNECTOR_ID, '--my-tokens');

    const exitCodePromise = connect(client);

    await expect(client.stderr).toOutput('Are you sure?');
    client.stdin.write('n\n');

    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
    expect(deleteCalled).toBe(false);
    expect(client.stderr.getFullOutput()).toContain('Canceled');
  });

  it('emits a JSON receipt on --yes --format=json', async () => {
    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({
        id: CONNECTOR_ID,
        uid: CONNECTOR_UID,
        name: CONNECTOR_NAME,
        supportsRevocation: true,
      });
    });
    client.scenario.delete(
      '/v1/connect/connectors/:clientId/tokens',
      (_req, res) => {
        res.json(DEFAULT_REVOKE_RESULT);
      }
    );

    client.setArgv(
      'connect',
      'revoke-tokens',
      CONNECTOR_ID,
      '--my-tokens',
      '--yes',
      '--format=json'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput().trim());
    expect(parsed).toMatchObject({
      id: CONNECTOR_ID,
      uid: CONNECTOR_UID,
      scope: 'mine',
      supportsRevocation: true,
      tokensFound: 2,
      deleted: 2,
      providerRevoked: 2,
      providerSkipped: 0,
      providerFailed: 0,
    });
  });

  it('emits scope:all in JSON receipt for --all-tokens', async () => {
    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({ id: CONNECTOR_ID, uid: CONNECTOR_UID, name: CONNECTOR_NAME });
    });
    client.scenario.delete(
      '/v1/connect/connectors/:clientId/tokens',
      (_req, res) => {
        res.json(DEFAULT_REVOKE_RESULT);
      }
    );

    client.setArgv(
      'connect',
      'revoke-tokens',
      CONNECTOR_ID,
      '--all-tokens',
      '--yes',
      '--format=json'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput().trim());
    expect(parsed.scope).toBe('all');
  });

  it('surfaces a friendly error on 403 from the DELETE endpoint', async () => {
    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({ id: CONNECTOR_ID, uid: CONNECTOR_UID, name: CONNECTOR_NAME });
    });
    client.scenario.delete(
      '/v1/connect/connectors/:clientId/tokens',
      (_req, res) => {
        res.statusCode = 403;
        res.json({ error: { code: 'forbidden', message: 'Forbidden' } });
      }
    );

    client.setArgv(
      'connect',
      'revoke-tokens',
      CONNECTOR_ID,
      '--my-tokens',
      '--yes'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      "don't have permission to revoke tokens"
    );
  });

  it('warns when providerFailed is non-zero', async () => {
    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({ id: CONNECTOR_ID, uid: CONNECTOR_UID, name: CONNECTOR_NAME });
    });
    client.scenario.delete(
      '/v1/connect/connectors/:clientId/tokens',
      (_req, res) => {
        res.json({ ...DEFAULT_REVOKE_RESULT, providerFailed: 1 });
      }
    );

    client.setArgv(
      'connect',
      'revoke-tokens',
      CONNECTOR_ID,
      '--my-tokens',
      '--yes'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'could not be revoked from the provider'
    );
  });

  it('warns before confirmation when connector does not support provider revocation', async () => {
    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({
        id: CONNECTOR_ID,
        uid: CONNECTOR_UID,
        name: CONNECTOR_NAME,
        supportsRevocation: false,
      });
    });
    client.scenario.delete(
      '/v1/connect/connectors/:clientId/tokens',
      (_req, res) => {
        res.json(DEFAULT_REVOKE_RESULT);
      }
    );

    client.setArgv('connect', 'revoke-tokens', CONNECTOR_ID, '--my-tokens');

    const exitCodePromise = connect(client);

    await expect(client.stderr).toOutput(
      'does not support provider-side token revocation'
    );
    await expect(client.stderr).toOutput('Are you sure?');
    client.stdin.write('y\n');

    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
  });

  it('warns after success when connector does not support provider revocation', async () => {
    client.scenario.get('/v1/connect/connectors/:clientId', (_req, res) => {
      res.json({
        id: CONNECTOR_ID,
        uid: CONNECTOR_UID,
        name: CONNECTOR_NAME,
        supportsRevocation: false,
      });
    });
    client.scenario.delete(
      '/v1/connect/connectors/:clientId/tokens',
      (_req, res) => {
        res.json(DEFAULT_REVOKE_RESULT);
      }
    );

    client.setArgv(
      'connect',
      'revoke-tokens',
      CONNECTOR_ID,
      '--my-tokens',
      '--yes'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'does not support provider-side token revocation'
    );
    expect(client.stderr.getFullOutput()).toContain(
      'may remain valid at the provider'
    );
  });
});
