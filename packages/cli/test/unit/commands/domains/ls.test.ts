import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import domains from '../../../../src/commands/domains';
import { useUser } from '../../../mocks/user';
import { useDomains } from '../../../mocks/domains';

describe('domains ls', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'domains';
      const subcommand = 'ls';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = domains(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });

    it('prints help for the list subcommand', async () => {
      client.setArgv('domains', 'ls', '--help');
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput('Show all domains in a list');
      await expect(exitCodePromise).resolves.toEqual(0);
    });
  });

  it('should list up to 20 domains by default', async () => {
    useUser();
    useDomains();
    client.setArgv('domains', 'ls');
    const exitCode = await domains(client);
    expect(exitCode, 'exit code for "domains"').toEqual(0);
    await expect(client.stderr).toOutput('example-19.com');
  });

  it('tracks subcommand invocation', async () => {
    useUser();
    useDomains();
    client.setArgv('domains', 'ls');
    const exitCode = await domains(client);
    expect(exitCode, 'exit code for "domains"').toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:list',
        value: 'ls',
      },
    ]);
  });

  describe('--limit', () => {
    it('should list up to 2 domains if limit set to 2', async () => {
      useUser();
      useDomains();
      client.setArgv('domains', 'ls', '--limit', '2');
      const exitCode = await domains(client);
      expect(exitCode, 'exit code for "domains"').toEqual(0);

      await expect(client.stderr).toOutput('example-1.com');
    });

    it('tracks telemetry data', async () => {
      useUser();
      useDomains();
      client.setArgv('domains', 'ls', '--limit', '2');
      const exitCode = await domains(client);
      expect(exitCode, 'exit code for "domains"').toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:list',
          value: 'ls',
        },
        {
          key: 'option:limit',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--next', () => {
    it('tracks telemetry data', async () => {
      useUser();
      useDomains();
      client.setArgv('domains', 'ls', '--next', '1730124407638');
      const exitCode = await domains(client);
      expect(exitCode, 'exit code for "domains"').toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:list',
          value: 'ls',
        },
        {
          key: 'option:next',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--format', () => {
    it('tracks telemetry for --format json', async () => {
      useUser();
      useDomains();
      client.setArgv('domains', 'ls', '--format', 'json');
      const exitCode = await domains(client);
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

    it('outputs domains as valid JSON that can be piped to jq', async () => {
      useUser();
      useDomains();
      client.setArgv('domains', 'ls', '--format', 'json');
      const exitCode = await domains(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      // Should be valid JSON - this will throw if not parseable
      const jsonOutput = JSON.parse(output);

      expect(jsonOutput).toHaveProperty('domains');
      expect(jsonOutput).toHaveProperty('pagination');
      expect(Array.isArray(jsonOutput.domains)).toBe(true);
    });

    it('outputs correct domain structure in JSON', async () => {
      useUser();
      useDomains();
      client.setArgv('domains', 'ls', '--format', 'json');
      const exitCode = await domains(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const jsonOutput = JSON.parse(output);

      expect(jsonOutput.domains.length).toBeGreaterThan(0);
      const firstDomain = jsonOutput.domains[0];
      expect(firstDomain).toHaveProperty('name');
      expect(firstDomain).toHaveProperty('registrar');
      expect(firstDomain).toHaveProperty('nameservers');
      expect(firstDomain).toHaveProperty('createdAt');
    });
  });
  describe('--next cursor', () => {
    function usePagedApi() {
      const queries: Record<string, unknown>[] = [];
      client.scenario.get('/v5/domains', (req, res) => {
        queries.push(req.query);
        res.json({
          domains: [],
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
      client.setArgv('domains', 'ls', ...args);

      expect(await domains(client)).toBe(0);
      expect(queries[0].until).toBe('1584722256178');
      expect(client.stderr.getFullOutput()).toContain(
        '  Next page:\n    vercel domains ls --next 1584722256000\n'
      );
    });

    it('warns when the hidden -N is used, and not with --json', async () => {
      useUser();
      usePagedApi();
      client.setArgv('domains', 'ls', '-N', '1584722256178');
      expect(await domains(client)).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(
        '! -N is deprecated. Use --next.'
      );

      client.reset();
      useUser();
      usePagedApi();
      client.setArgv('domains', 'ls', '-N', '1584722256178', '--json');
      expect(await domains(client)).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
      expect(JSON.parse(client.stdout.getFullOutput()).pagination.next).toBe(
        1584722256000
      );
    });

    it('rejects a value that is not a cursor as a usage error', async () => {
      useUser();
      const queries = usePagedApi();
      client.setArgv('domains', 'ls', '--next', 'oops');

      expect(await domains(client)).toBe(2);
      expect(queries).toHaveLength(0);
      expect(client.stderr.getFullOutput()).toContain(
        '--next must be the cursor printed with the previous page.'
      );
    });
  });
});
