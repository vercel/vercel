import { resolve } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import crons from '../../../../src/commands/crons';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';

describe('crons add', () => {
  let cwd: string;

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    cwd = setupTmpDir('crons-add');
    client.cwd = cwd;
  });

  describe('--help', () => {
    it('prints help and tracks telemetry', async () => {
      client.setArgv('crons', 'add', '--help');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'crons:add' },
      ]);
    });
  });

  describe('with flags', () => {
    it('adds cron to new vercel.json', async () => {
      client.setArgv(
        'crons',
        'add',
        '--path',
        '/api/cron',
        '--schedule',
        '0 10 * * *'
      );
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);

      const content = JSON.parse(
        await readFile(resolve(cwd, 'vercel.json'), 'utf-8')
      );
      expect(content.crons).toEqual([
        { path: '/api/cron', schedule: '0 10 * * *' },
      ]);
      await expect(client.stderr).toOutput('Added cron job');
    });

    it('appends cron to existing vercel.json', async () => {
      await writeFile(
        resolve(cwd, 'vercel.json'),
        JSON.stringify(
          { crons: [{ path: '/api/existing', schedule: '0 0 * * *' }] },
          null,
          2
        ) + '\n',
        'utf-8'
      );

      client.setArgv(
        'crons',
        'add',
        '--path',
        '/api/new',
        '--schedule',
        '*/5 * * * *'
      );
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);

      const content = JSON.parse(
        await readFile(resolve(cwd, 'vercel.json'), 'utf-8')
      );
      expect(content.crons).toEqual([
        { path: '/api/existing', schedule: '0 0 * * *' },
        { path: '/api/new', schedule: '*/5 * * * *' },
      ]);
    });

    it('preserves other config in vercel.json', async () => {
      await writeFile(
        resolve(cwd, 'vercel.json'),
        JSON.stringify(
          { rewrites: [{ source: '/', destination: '/index' }] },
          null,
          2
        ) + '\n',
        'utf-8'
      );

      client.setArgv(
        'crons',
        'add',
        '--path',
        '/api/cron',
        '--schedule',
        '0 0 * * *'
      );
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);

      const content = JSON.parse(
        await readFile(resolve(cwd, 'vercel.json'), 'utf-8')
      );
      expect(content.rewrites).toEqual([
        { source: '/', destination: '/index' },
      ]);
      expect(content.crons).toEqual([
        { path: '/api/cron', schedule: '0 0 * * *' },
      ]);
    });
  });

  describe('validation', () => {
    it('rejects path not starting with /', async () => {
      client.setArgv(
        'crons',
        'add',
        '--path',
        'api/cron',
        '--schedule',
        '0 0 * * *'
      );
      const exitCode = await crons(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Path must start with /');
    });

    it('rejects invalid cron schedule', async () => {
      client.setArgv(
        'crons',
        'add',
        '--path',
        '/api/cron',
        '--schedule',
        'not-a-schedule'
      );
      const exitCode = await crons(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('must have exactly 5 fields');
    });

    it('rejects duplicate cron path', async () => {
      await writeFile(
        resolve(cwd, 'vercel.json'),
        JSON.stringify(
          { crons: [{ path: '/api/cron', schedule: '0 0 * * *' }] },
          null,
          2
        ) + '\n',
        'utf-8'
      );

      client.setArgv(
        'crons',
        'add',
        '--path',
        '/api/cron',
        '--schedule',
        '*/5 * * * *'
      );
      const exitCode = await crons(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('already exists');
    });

    it('rejects path longer than 512 characters', async () => {
      const longPath = '/' + 'a'.repeat(512);
      client.setArgv(
        'crons',
        'add',
        '--path',
        longPath,
        '--schedule',
        '0 0 * * *'
      );
      const exitCode = await crons(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('512 characters or less');
    });
  });

  describe('error handling', () => {
    it('fails on malformed vercel.json', async () => {
      await writeFile(resolve(cwd, 'vercel.json'), '{invalid json', 'utf-8');

      client.setArgv(
        'crons',
        'add',
        '--path',
        '/api/cron',
        '--schedule',
        '0 0 * * *'
      );
      const exitCode = await crons(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Failed to parse');
    });
  });

  describe('interactive mode', () => {
    it('prompts for path and schedule', async () => {
      client.setArgv('crons', 'add');
      const exitCodePromise = crons(client);

      await expect(client.stderr).toOutput('API route path');
      client.stdin.write('/api/cron\n');

      await expect(client.stderr).toOutput('cron schedule expression');
      client.stdin.write('0 0 * * *\n');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      const content = JSON.parse(
        await readFile(resolve(cwd, 'vercel.json'), 'utf-8')
      );
      expect(content.crons).toEqual([
        { path: '/api/cron', schedule: '0 0 * * *' },
      ]);
    });

    it('errors in non-interactive mode without flags', async () => {
      client.setArgv('crons', 'add');
      (client.stdin as any).isTTY = false;

      const exitCode = await crons(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Missing required flags');
    });
  });

  describe('telemetry', () => {
    it('tracks subcommand and options', async () => {
      client.setArgv(
        'crons',
        'add',
        '--path',
        '/api/cron',
        '--schedule',
        '0 0 * * *'
      );
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:add', value: 'add' },
        { key: 'option:path', value: '[REDACTED]' },
        { key: 'option:schedule', value: '[REDACTED]' },
      ]);
    });
  });
});
