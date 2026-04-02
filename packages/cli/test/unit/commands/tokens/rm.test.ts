import { describe, expect, it } from 'vitest';
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

  it('errors when more than one id is passed', async () => {
    useUser();
    client.setArgv('tokens', 'rm', 'tok_a', 'tok_b');

    const exitCode = await tokens(client);
    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('Too many arguments');
  });
});
