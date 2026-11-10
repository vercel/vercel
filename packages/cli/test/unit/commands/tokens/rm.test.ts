import { afterEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import tokens from '../../../../src/commands/tokens';
import { useUser } from '../../../mocks/user';

describe('tokens revoke', () => {
  it('revokes a token', async () => {
    useUser();
    client.scenario.delete('/v3/user/tokens/:tokenId', (req, res) => {
      expect(req.params.tokenId).toBe('tok_abc');
      res.status(200).json({});
    });
    client.setArgv('tokens', 'revoke', 'tok_abc', '--yes');

    const exitCode = await tokens(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Revoked token tok_abc');
    expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:revoke', value: 'revoke' },
    ]);
  });

  it.each([
    'remove',
    'rm',
    'delete',
  ])('warns when invoked as the deprecated %s name', async name => {
    useUser();
    client.scenario.delete('/v3/user/tokens/:tokenId', (_req, res) => {
      res.status(200).json({});
    });
    client.setArgv('tokens', name, 'tok_abc', '--yes');

    const exitCode = await tokens(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput(
      `\`vercel tokens ${name}\` is deprecated. Use \`vercel tokens revoke\`.`
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:revoke', value: name },
    ]);
  });

  describe('confirmation', () => {
    let revoked: boolean;

    function useRevokeToken() {
      revoked = false;
      useUser();
      client.scenario.delete('/v3/user/tokens/:tokenId', (_req, res) => {
        revoked = true;
        res.status(200).json({});
      });
    }

    it('asks before revoking', async () => {
      useRevokeToken();
      client.setArgv('tokens', 'revoke', 'tok_abc');
      const exitCodePromise = tokens(client);

      await expect(client.stderr).toOutput(
        'Revoke token tok_abc? Anything that uses it will stop working.'
      );
      client.stdin.write('y\n');

      expect(await exitCodePromise).toBe(0);
      expect(revoked).toBe(true);
    });

    it('revokes nothing when the prompt is declined', async () => {
      useRevokeToken();
      client.setArgv('tokens', 'revoke', 'tok_abc');
      const exitCodePromise = tokens(client);

      await expect(client.stderr).toOutput('Revoke token tok_abc?');
      client.stdin.write('n\n');

      expect(await exitCodePromise).toBe(130);
      await expect(client.stderr).toOutput('Canceled. Nothing was changed.');
      expect(revoked).toBe(false);
    });

    it('still revokes without a terminal, with a warning', async () => {
      useRevokeToken();
      client.stdin.isTTY = false;
      client.setArgv('tokens', 'revoke', 'tok_abc');

      expect(await tokens(client)).toBe(0);
      expect(revoked).toBe(true);
      expect(client.stderr.getFullOutput()).toContain(
        'Revoking a token without a terminal will need --yes in a future major version.'
      );
    });

    it('does not prompt or warn with --json', async () => {
      useRevokeToken();
      client.setArgv('tokens', 'revoke', 'tok_abc', '--json');

      expect(await tokens(client)).toBe(0);
      expect(revoked).toBe(true);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
        ok: true,
        id: 'tok_abc',
      });
      expect(client.stderr.getFullOutput()).not.toContain('Revoke token');
      expect(client.stderr.getFullOutput()).not.toContain('future major');
    });
  });

  it('errors when id is missing', async () => {
    useUser();
    client.setArgv('tokens', 'revoke');

    const exitCode = await tokens(client);
    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('Token id is required');
  });

  describe('--non-interactive', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      client.nonInteractive = false;
    });

    it('emits JSON with next when id is missing', async () => {
      useUser();
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv(
        'tokens',
        'revoke',
        '--non-interactive',
        '--cwd=/tmp/proj'
      );

      await expect(tokens(client)).rejects.toThrow('exit:2');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_arguments',
      });
      expect(Array.isArray(payload.next)).toBe(true);
      expect(
        payload.next.some(
          (n: { command?: string }) =>
            String(n.command).includes('tokens ls') &&
            String(n.command).includes('--cwd=/tmp/proj')
        )
      ).toBe(true);
      expect(
        payload.next.some(
          (n: { command?: string }) =>
            String(n.command).includes('tokens revoke <token_id>') &&
            String(n.command).includes('--non-interactive')
        )
      ).toBe(true);
    });
  });

  it('errors when more than one id is passed', async () => {
    useUser();
    client.setArgv('tokens', 'revoke', 'tok_a', 'tok_b');

    const exitCode = await tokens(client);
    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('Too many arguments');
  });
});
