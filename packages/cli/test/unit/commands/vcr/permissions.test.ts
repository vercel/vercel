import { describe, it, expect } from 'vitest';
import vcr from '../../../../src/commands/vcr';
import { client } from '../../../mocks/client';

describe('vcr permissions', () => {
  it('errors when invoked without a repository or action', async () => {
    client.setArgv('vcr', 'permissions');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Missing repository');
  });

  it('errors when the action is missing', async () => {
    client.setArgv('vcr', 'permissions', 'my-app');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Please specify an action');
  });

  it('errors on an unknown action', async () => {
    client.setArgv('vcr', 'permissions', 'my-app', 'bogus');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Unknown "vcr permissions" action "bogus"'
    );
  });

  describe('--help', () => {
    it('shows group help and tracks telemetry', async () => {
      client.setArgv('vcr', 'permissions', '--help');
      const exitCode = await vcr(client);
      expect(exitCode).toBe(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'vcr:permissions',
        },
      ]);
    });

    it('shows action help when the repository is present', async () => {
      client.setArgv('vcr', 'permissions', 'my-app', 'add', '--help');
      const exitCode = await vcr(client);
      expect(exitCode).toBe(2);
      expect(client.stderr.getFullOutput()).toContain(
        'vcr permissions my-app add team_1a2b3c4d'
      );
    });

    it('shows action help when the repository is omitted', async () => {
      client.setArgv('vcr', 'permissions', 'ls', '--help');
      const exitCode = await vcr(client);
      expect(exitCode).toBe(2);
      expect(client.stderr.getFullOutput()).toContain(
        'vcr permissions my-app ls'
      );
    });
  });
});
