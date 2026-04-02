import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import open from 'open';
import { client } from '../../../mocks/client';
import tokens from '../../../../src/commands/tokens';
import { useUser } from '../../../mocks/user';

vi.mock('open', () => ({
  default: vi.fn().mockResolvedValue({ on: vi.fn() }),
}));

describe('tokens add', () => {
  it('creates a token', async () => {
    useUser();
    client.scenario.post('/v3/user/tokens', (req, res) => {
      expect((req.body as { name: string }).name).toBe('My CI');
      res.json({
        token: { id: 'tok_new', name: 'My CI' },
        bearerToken: 'secret_value_once',
      });
    });
    client.setArgv('tokens', 'add', 'My CI');

    const exitCode = await tokens(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('secret_value_once');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:add', value: 'add' },
    ]);
  });

  it('errors when name is missing', async () => {
    useUser();
    client.setArgv('tokens', 'add');

    const exitCode = await tokens(client);
    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('Token name is required');
  });

  it('errors when more than one name is passed', async () => {
    useUser();
    client.setArgv('tokens', 'add', 'one', 'two');

    const exitCode = await tokens(client);
    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('Too many arguments');
  });

  describe('classic token required (API 403)', () => {
    beforeEach(() => {
      // `open` is skipped when CI is set (see `openTokensDashboardInBrowser`); clear it so we assert the open path.
      vi.stubEnv('CI', '');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.mocked(open).mockClear();
      vi.restoreAllMocks();
      client.nonInteractive = false;
    });

    it('prints guidance and opens the tokens dashboard', async () => {
      useUser();

      client.scenario.post('/v3/user/tokens', (_req, res) => {
        res.status(403).json({
          error: {
            message:
              'Only user authentication tokens can be used to create new tokens.',
          },
        });
      });
      client.setArgv('tokens', 'add', 'x');

      const exitCode = await tokens(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('classic personal access token');
      expect(vi.mocked(open)).toHaveBeenCalledWith(
        'https://vercel.com/account/tokens'
      );
    });

    it('emits structured JSON in non-interactive mode', async () => {
      useUser();
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.scenario.post('/v3/user/tokens', (_req, res) => {
        res.status(403).json({
          error: {
            message:
              'Only user authentication tokens can be used to create new tokens.',
          },
        });
      });

      client.nonInteractive = true;
      client.setArgv('tokens', 'add', 'my-token', '--non-interactive');

      await expect(tokens(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'classic_token_required',
        userActionRequired: true,
        verification_uri: 'https://vercel.com/account/tokens',
      });
      expect(Array.isArray(payload.next)).toBe(true);
      expect(
        payload.next.some((n: { command?: string }) =>
          String(n.command).includes('vercel.com/account/tokens')
        )
      ).toBe(true);
      expect(
        payload.next.some(
          (n: { command?: string }) =>
            String(n.command).includes('VERCEL_TOKEN') &&
            String(n.command).includes('<class_access_token>')
        )
      ).toBe(true);
    });

    it('emits structured JSON when the API requires full user token scope (403)', async () => {
      useUser();
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.scenario.post('/v3/user/tokens', (_req, res) => {
        res.status(403).json({
          error: {
            message:
              'To create a token you must be authenticated to scope "brookemosby"',
          },
        });
      });

      client.nonInteractive = true;
      client.setArgv('tokens', 'add', 'my-token', '--non-interactive');

      await expect(tokens(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'token_user_scope_required',
        userActionRequired: true,
        verification_uri: 'https://vercel.com/account/tokens',
      });
      expect(payload.message).toContain('authenticated to scope');
    });
  });
});
