import { describe, it, expect } from 'vitest';
import git from '../../../../src/commands/git';
import { client } from '../../../mocks/client';

describe('git', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'git';

      client.setArgv(command, '--help');
      const exitCode = await git(client);
      expect(exitCode, 'exit code for git').toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  it('displays help when invoked without subcommand', async () => {
    client.setArgv('git');
    const exitCode = await git(client);
    expect(exitCode, 'exit code for git').toBe(2);
  });

  describe('unrecognized subcommand', () => {
    it('shows help', async () => {
      client.setArgv('git', 'not-a-command');
      const exitCode = await git(client);
      expect(exitCode).toEqual(2);
    });
  });
});
