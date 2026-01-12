import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import upgrade from '../../../../src/commands/upgrade';

describe('upgrade', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'upgrade';

      client.setArgv(command, '--help');
      const exitCodePromise = upgrade(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  describe('--dry-run', () => {
    it('tracks telemetry', async () => {
      client.setArgv('upgrade', '--dry-run');
      const exitCodePromise = upgrade(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:dry-run',
          value: 'TRUE',
        },
      ]);
    });

    it('prints upgrade information without executing', async () => {
      client.setArgv('upgrade', '--dry-run');
      const exitCode = await upgrade(client);
      expect(exitCode).toBe(0);

      await expect(client.stderr).toOutput('Current version:');
      await expect(client.stderr).toOutput('Installation type:');
      await expect(client.stderr).toOutput('Upgrade command:');
    });
  });

  describe('--json', () => {
    it('tracks telemetry', async () => {
      client.setArgv('upgrade', '--json');
      const exitCodePromise = upgrade(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:json',
          value: 'TRUE',
        },
      ]);
    });

    it('outputs valid JSON', async () => {
      client.setArgv('upgrade', '--json');
      const exitCode = await upgrade(client);
      expect(exitCode).toBe(0);

      const output = client.stdout.getFullOutput();
      const json = JSON.parse(output);

      expect(json).toHaveProperty('currentVersion');
      expect(json).toHaveProperty('installationType');
      expect(json).toHaveProperty('upgradeCommand');
      expect(['global', 'local']).toContain(json.installationType);
    });
  });

  it('should reject invalid arguments', async () => {
    client.setArgv('--invalid');
    const result = await upgrade(client);
    expect(result).toBe(1);
  });
});
