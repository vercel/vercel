import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useCert } from '../../../mocks/certs';
import certs from '../../../../src/commands/certs';

describe('certs ls', () => {
  describe('invalid argument', () => {
    it('errors', async () => {
      useUser();
      client.setArgv('certs', 'ls', 'balderdash');
      const exitCode = await certs(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Invalid number of arguments');
    });
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'certs';
      const subcommand = 'ls';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = certs(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  it('should list up to 20 certs by default', async () => {
    useUser();
    useCert();

    client.setArgv('certs', 'ls');
    const exitCodePromise = certs(client);
    await expect(client.stdout).toOutput('dummy-19.cert');
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "certs"').toEqual(0);
  });

  it('tracks subcommand invocation', async () => {
    useUser();
    useCert();

    client.setArgv('certs', 'ls');
    const exitCodePromise = certs(client);

    await expect(exitCodePromise).resolves.toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:list',
        value: 'ls',
      },
    ]);
  });

  describe('--next', () => {
    it('tracks usage', async () => {
      useUser();
      useCert();

      client.setArgv('certs', 'ls', '--next', '123456');
      const exitCodePromise = certs(client);

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

  describe('--limit', () => {
    it('should list up to 2 certs if limit set to 2', async () => {
      useUser();
      useCert();
      client.setArgv('certs', 'ls', '--limit', '2');
      const exitCodePromise = certs(client);
      await expect(client.stdout).toOutput('dummy-1.cert');
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "certs"').toEqual(0);
    });

    it('tracks usage', async () => {
      useUser();
      useCert();
      client.setArgv('certs', 'ls', '--limit', '2');
      const exitCodePromise = certs(client);

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

  it('should show permission error if user does not have permission', async () => {
    useUser();
    client.scenario.get('/v4/certs', (_req, res) => {
      res.status(403).json({
        error: {
          code: 'forbidden',
          message: "You don't have permission to list the domain certificate.",
        },
      });
    });

    client.setArgv('certs', 'ls');

    const exec = certs(client);

    await expect(exec).rejects.toThrow(
      "You don't have permission to list the domain certificate."
    );
  });

  it('writes certs and the next page to stdout with --json', async () => {
    useUser();
    useCert();
    client.setArgv('certs', 'ls', '--json');

    expect(await certs(client)).toBe(0);
    const result = JSON.parse(client.stdout.getFullOutput());
    expect(result.certs).toHaveLength(20);
    expect(result.pagination).toEqual({ next: null });
    expect(client.stderr.getFullOutput()).not.toContain('found under');
  });
  describe('--next cursor', () => {
    function usePagedApi() {
      const queries: Record<string, unknown>[] = [];
      client.scenario.get('/v4/certs', (req, res) => {
        queries.push(req.query);
        res.json({ certs: [], pagination: { count: 0, next: 1584722256000 } });
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
      client.setArgv('certs', 'ls', ...args);

      expect(await certs(client)).toBe(0);
      expect(queries[0].until).toBe('1584722256178');
      expect(client.stderr.getFullOutput()).toContain(
        '  Next page:\n    vercel certs ls --next 1584722256000\n'
      );
    });

    it('warns when the hidden -N is used, and not with --json', async () => {
      useUser();
      usePagedApi();
      client.setArgv('certs', 'ls', '-N', '1584722256178');
      expect(await certs(client)).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(
        '! -N is deprecated. Use --next.'
      );

      client.reset();
      useUser();
      usePagedApi();
      client.setArgv('certs', 'ls', '-N', '1584722256178', '--json');
      expect(await certs(client)).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
      expect(JSON.parse(client.stdout.getFullOutput()).pagination.next).toBe(
        1584722256000
      );
    });

    it('rejects a value that is not a cursor as a usage error', async () => {
      useUser();
      const queries = usePagedApi();
      client.setArgv('certs', 'ls', '--next', 'oops');

      expect(await certs(client)).toBe(2);
      expect(queries).toHaveLength(0);
      expect(client.stderr.getFullOutput()).toContain(
        '--next must be the cursor printed with the previous page.'
      );
    });
  });
});
