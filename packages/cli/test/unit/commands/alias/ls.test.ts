import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import alias from '../../../../src/commands/alias';
import { useUser } from '../../../mocks/user';
import { useAlias } from '../../../mocks/alias';

describe('alias ls', () => {
  beforeEach(() => {
    useUser();
  });

  describe('invalid argument', () => {
    it('errors', async () => {
      client.setArgv('alias', 'ls', 'balderdash');
      const exitCode = await alias(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Invalid number of arguments');
    });
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'alias';
      const subcommand = 'ls';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = alias(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  it('should list up to 20 aliases by default', async () => {
    useAlias();
    client.setArgv('alias', 'ls');
    const exitCode = await alias(client);
    expect(exitCode, 'exit code for "alias"').toEqual(0);
    await expect(client.stdout).toOutput('dummy-19.app');
  });

  describe('--next', () => {
    it('tracks subcommand and option values', async () => {
      useAlias();
      client.setArgv('alias', 'ls', '--next', '1727714910573');
      const exitCode = await alias(client);
      expect(exitCode, 'exit code of "alias"').toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: `subcommand:list`,
          value: 'ls',
        },
        {
          key: `option:next`,
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--limit', () => {
    it('should list up to 2 aliases', async () => {
      useAlias();
      client.setArgv('alias', 'ls', '--limit', '2');
      const exitCode = await alias(client);
      expect(exitCode, 'exit code of "alias"').toEqual(0);
      await expect(client.stdout).toOutput('dummy-1.app');
    });

    it('tracks subcommand and option values', async () => {
      useAlias();
      client.setArgv('alias', 'ls', '--limit', '2');
      const exitCode = await alias(client);
      expect(exitCode, 'exit code of "alias"').toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: `subcommand:list`,
          value: 'ls',
        },
        {
          key: `option:limit`,
          value: '2',
        },
      ]);
    });
  });

  describe('--format', () => {
    it('tracks telemetry for --format json', async () => {
      useAlias();
      client.setArgv('alias', 'ls', '--format', 'json');
      const exitCode = await alias(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:list',
          value: 'ls',
        },
        {
          key: 'option:format',
          value: 'json',
        },
      ]);
    });

    it('outputs aliases as valid JSON that can be piped to jq', async () => {
      useAlias();
      client.setArgv('alias', 'ls', '--format', 'json');
      const exitCode = await alias(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      // Should be valid JSON - this will throw if not parseable
      const jsonOutput = JSON.parse(output);

      expect(jsonOutput).toHaveProperty('aliases');
      expect(jsonOutput).toHaveProperty('pagination');
      expect(Array.isArray(jsonOutput.aliases)).toBe(true);
    });

    it('outputs correct alias structure in JSON', async () => {
      useAlias();
      client.setArgv('alias', 'ls', '--format', 'json');
      const exitCode = await alias(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const jsonOutput = JSON.parse(output);

      expect(jsonOutput.aliases.length).toBeGreaterThan(0);
      const firstAlias = jsonOutput.aliases[0];
      expect(firstAlias).toHaveProperty('alias');
      expect(firstAlias).toHaveProperty('deploymentId');
      expect(firstAlias).toHaveProperty('createdAt');
    });
  });
});
