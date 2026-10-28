import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import dns from '../../../../src/commands/dns';
import { useUser } from '../../../mocks/user';
import { useDns } from '../../../mocks/dns';

describe('dns ls', () => {
  beforeEach(() => {
    useUser();
    useDns();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'dns';
      const subcommand = 'ls';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = dns(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
      await expect(client.stderr).toOutput('--json');
    });
  });

  describe('[domain] missing', () => {
    it('should list up to 20 dns by default', async () => {
      client.setArgv('dns', 'ls');
      const exitCodePromise = dns(client);
      await expect(client.stderr).toOutput('example-19.com');
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "dns"').toEqual(0);
    });

    it('track subcommand invocation', async () => {
      client.setArgv('dns', 'ls');
      const exitCodePromise = dns(client);

      await expect(exitCodePromise).resolves.toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:list',
          value: 'ls',
        },
      ]);
    });

    describe('--limit', () => {
      it('should list up to 2 dns if limit set to 2', async () => {
        client.setArgv('dns', 'ls', '--limit', '2');
        const exitCodePromise = dns(client);
        await expect(client.stderr).toOutput('example-2.com');
        const exitCode = await exitCodePromise;
        expect(exitCode, 'exit code for "dns"').toEqual(0);
      });

      it('track subcommand invocation', async () => {
        client.setArgv('dns', 'ls', '--limit', '2');
        const exitCodePromise = dns(client);

        await expect(exitCodePromise).resolves.toEqual(0);
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
      it('tracks the use of next option', async () => {
        client.setArgv('dns', 'ls', '--next', '1729878610745');
        const exitCodePromise = dns(client);

        await expect(exitCodePromise).resolves.toEqual(0);
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
  });

  describe('machine-readable output', () => {
    const records = [
      {
        id: 'rec_123',
        name: 'www',
        type: 'A',
        value: '198.51.100.100',
        creator: 'user_abc',
        createdAt: 1729878610745,
      },
    ];
    const pagination = { count: 1, total: 2, next: 1729878610744 };

    it.each([
      ['--format', 'json'],
      ['--format=json'],
      ['-F', 'json'],
      ['--json'],
    ])('prints a JSON envelope for %s %s', async (...formatArgs: string[]) => {
      client.scenario.get('/v5/domains/:domain?/records', (_req, res) => {
        res.json({ records, pagination });
      });
      client.setArgv('dns', 'ls', 'example-19.com', ...formatArgs);

      await expect(dns(client)).resolves.toEqual(0);

      const stdout = client.stdout.getFullOutput();
      expect(JSON.parse(stdout)).toEqual({
        records: [{ domainName: 'example-19.com', records }],
        pagination,
      });
      expect(stdout).not.toContain('Records found under');
      expect(stdout).not.toContain('id    name');
    });

    it('tracks the output format option', async () => {
      client.scenario.get('/v5/domains/:domain?/records', (_req, res) => {
        res.json({ records, pagination });
      });
      client.setArgv('dns', 'ls', 'example-19.com', '--format', 'json');

      await expect(dns(client)).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:list',
          value: 'ls',
        },
        {
          key: 'argument:domain',
          value: '[REDACTED]',
        },
        {
          key: 'option:format',
          value: '[REDACTED]',
        },
      ]);
    });

    it('returns an empty single-domain result as JSON', async () => {
      const emptyPagination = { count: 0, total: 0 };
      client.scenario.get('/v5/domains/:domain?/records', (_req, res) => {
        res.json({ records: [], pagination: emptyPagination });
      });
      client.setArgv('dns', 'ls', 'example-19.com', '--json');

      await expect(dns(client)).resolves.toEqual(0);

      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
        records: [{ domainName: 'example-19.com', records: [] }],
        pagination: emptyPagination,
      });
    });

    it('returns an envelope when listing all domains', async () => {
      client.setArgv('dns', 'ls', '--json');

      await expect(dns(client)).resolves.toEqual(0);

      const stdout = client.stdout.getFullOutput();
      const parsed = JSON.parse(stdout);
      expect(parsed.records).toHaveLength(20);
      expect(parsed.records[0]).toMatchObject({
        domainName: 'example-0.com',
        records: expect.any(Array),
      });
      expect(parsed.pagination).toMatchObject({ count: 20, total: 20 });
      expect(stdout).not.toContain('Records found under');
    });

    it('rejects unsupported output formats without a success payload', async () => {
      client.setArgv('dns', 'ls', 'example-19.com', '--format', 'table');

      await expect(dns(client)).resolves.toEqual(2);

      expect(client.stdout.getFullOutput()).toBe('');
      await expect(client.stderr).toOutput('Invalid output format');
    });
  });

  describe('[domain]', () => {
    it('tracks the use of domain argument', async () => {
      client.scenario.get('/v5/domains/:domain?/records', (req, res) => {
        res.json({
          records: [],
          pagination: { count: 1, total: 1, page: 1, pages: 1 },
        });
      });
      client.setArgv('dns', 'ls', 'example-19.com');
      const exitCodePromise = dns(client);

      await expect(exitCodePromise).resolves.toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:list',
          value: 'ls',
        },
        {
          key: 'argument:domain',
          value: '[REDACTED]',
        },
      ]);
    });
  });
  describe('--next cursor', () => {
    function usePagedApi() {
      const queries: Record<string, unknown>[] = [];
      client.scenario.get('/v5/domains/:domain/records', (req, res) => {
        queries.push(req.query);
        res.json({
          records: [],
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
      client.setArgv('dns', 'ls', 'example.com', ...args);

      expect(await dns(client)).toBe(0);
      expect(queries[0].until).toBe('1584722256178');
      expect(client.stderr.getFullOutput()).toContain(
        '  Next page:\n    vercel dns ls example.com --next 1584722256000\n'
      );
    });

    it('warns when the hidden -N is used, and not with --json', async () => {
      useUser();
      usePagedApi();
      client.setArgv('dns', 'ls', 'example.com', '-N', '1584722256178');
      expect(await dns(client)).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(
        '! -N is deprecated. Use --next.'
      );

      client.reset();
      useUser();
      usePagedApi();
      client.setArgv(
        'dns',
        'ls',
        'example.com',
        '-N',
        '1584722256178',
        '--json'
      );
      expect(await dns(client)).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
      expect(JSON.parse(client.stdout.getFullOutput()).pagination.next).toBe(
        1584722256000
      );
    });

    it('rejects a value that is not a cursor as a usage error', async () => {
      useUser();
      const queries = usePagedApi();
      client.setArgv('dns', 'ls', 'example.com', '--next', 'oops');

      expect(await dns(client)).toBe(2);
      expect(queries).toHaveLength(0);
      expect(client.stderr.getFullOutput()).toContain(
        '--next must be the cursor printed with the previous page.'
      );
    });
  });
});
