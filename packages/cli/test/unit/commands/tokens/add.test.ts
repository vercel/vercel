import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import tokens from '../../../../src/commands/tokens';
import { useUser } from '../../../mocks/user';

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
});
