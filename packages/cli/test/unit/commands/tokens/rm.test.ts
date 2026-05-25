import { afterEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import tokens from '../../../../src/commands/tokens';
import { useUser } from '../../../mocks/user';

describe('tokens rm', () => {
  it('deletes a token', async () => {
    useUser();
    client.scenario.delete('/v3/user/tokens/:tokenId', (req, res) => {
      expect(req.params.tokenId).toBe('tok_abc');
      res.status(200).json({});
    });
    client.setArgv('tokens', 'rm', 'tok_abc');

    const exitCode = await tokens(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Removed token tok_abc');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:remove', value: 'rm' },
    ]);
  });

  it('errors when id is missing', async () => {
    useUser();
    client.setArgv('tokens', 'rm');

    const exitCode = await tokens(client);
    expect(exitCode).toBe(1);
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
      client.setArgv('tokens', 'rm', '--non-interactive', '--cwd=/tmp/proj');

      await expect(tokens(client)).rejects.toThrow('exit:1');

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
            String(n.command).includes('tokens rm <token_id>') &&
            String(n.command).includes('--non-interactive')
        )
      ).toBe(true);
    });
  });

  it('errors when more than one id is passed', async () => {
    useUser();
    client.setArgv('tokens', 'rm', 'tok_a', 'tok_b');

    const exitCode = await tokens(client);
    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('Too many arguments');
  });
});
