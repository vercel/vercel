import { describe, expect, it } from 'vitest';
import logout from '../../../../src/commands/logout';
import { client } from '../../../mocks/client';

describe.todo('logout', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'logout';

      client.setArgv(command, '--help');
      const exitCodePromise = logout(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });
});
