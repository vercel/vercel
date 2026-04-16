import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import tokens from '../../../../src/commands/tokens';
import { useUser } from '../../../mocks/user';

describe('tokens ls', () => {
  it('lists tokens in table output', async () => {
    useUser();
    client.scenario.get('/v6/user/tokens', (req, res) => {
      expect(req.query.limit).toBeUndefined();
      res.json({
        tokens: [{ id: 'tok_1', name: 'CLI', type: 'classic', active: true }],
        pagination: { count: 1, next: null, prev: null },
      });
    });
    client.setArgv('tokens', 'ls');

    const exitCode = await tokens(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('tok_1');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:list', value: 'ls' },
    ]);
  });

  it('outputs JSON with --format json', async () => {
    useUser();
    client.scenario.get('/v6/user/tokens', (_req, res) => {
      res.json({ tokens: [], pagination: {} });
    });
    client.setArgv('tokens', 'ls', '--format', 'json');

    const exitCode = await tokens(client);
    expect(exitCode).toBe(0);
    const jsonOutput = JSON.parse(client.stdout.getFullOutput());
    expect(jsonOutput.tokens).toEqual([]);
  });
});
