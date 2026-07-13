import { describe, it, expect } from 'vitest';
import vcr from '../../../../src/commands/vcr';
import { client } from '../../../mocks/client';

describe('vcr', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'vcr';

      client.setArgv(command, '--help');
      const exitCode = await vcr(client);
      expect(exitCode, 'exit code for vcr').toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:default`,
        },
      ]);
    });
  });

  it('displays help when invoked without subcommand', async () => {
    client.setArgv('vcr');
    const exitCode = await vcr(client);
    expect(exitCode, 'exit code for vcr').toBe(2);
  });

  describe('unrecognized subcommand', () => {
    it('shows help', async () => {
      client.setArgv('vcr', 'not-a-command');
      const exitCode = await vcr(client);
      expect(exitCode).toEqual(2);
    });
  });
});
