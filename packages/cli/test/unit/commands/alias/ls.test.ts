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
      await expect(exitCodePromise).resolves.toEqual(0);

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
  describe('--next cursor', () => {
    function usePagedApi() {
      const queries: Record<string, unknown>[] = [];
      client.scenario.get('/v3/now/aliases', (req, res) => {
        queries.push(req.query);
        res.json({
          aliases: [],
          pagination: { count: 0, next: 1584722256000 },
        });
      });
      return queries;
    }

    it.each([
      [['--next', '1584722256178']],
      [['--next=1584722256178']],
      [['-N', '1584722256178']],
    ])('sends %j to the API as the same timestamp as before', async args => {
      useUser();
      const queries = usePagedApi();
      client.setArgv('alias', 'ls', ...args);

      expect(await alias(client)).toBe(0);
      expect(queries[0].until).toBe('1584722256178');
      expect(client.stderr.getFullOutput()).toContain(
        '  Next page:\n    vercel alias ls --next 1584722256000\n'
      );
    });

    it('warns when the hidden -N is used, and not with --json', async () => {
      useUser();
      usePagedApi();
      client.setArgv('alias', 'ls', '-N', '1584722256178');
      expect(await alias(client)).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(
        '! -N is deprecated. Use --next.'
      );

      client.reset();
      useUser();
      usePagedApi();
      client.setArgv('alias', 'ls', '-N', '1584722256178', '--json');
      expect(await alias(client)).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
      expect(JSON.parse(client.stdout.getFullOutput()).pagination.next).toBe(
        1584722256000
      );
    });

    it('rejects a value that is not a cursor as a usage error', async () => {
      useUser();
      const queries = usePagedApi();
      client.setArgv('alias', 'ls', '--next', 'oops');

      expect(await alias(client)).toBe(2);
      expect(queries).toHaveLength(0);
      expect(client.stderr.getFullOutput()).toContain(
        '--next must be the cursor printed with the previous page.'
      );
    });
  });
});
