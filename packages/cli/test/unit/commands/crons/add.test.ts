import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import crons from '../../../../src/commands/crons';
import * as linkModule from '../../../../src/util/projects/link';

vi.mock('../../../../src/util/projects/link');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);

const projectId = 'proj_crons_test';
const projectName = 'crons-project';
const orgSlug = 'my-team';

function mockLinkedProject() {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: projectId,
      name: projectName,
      accountId: 'org_123',
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    org: { id: 'org_123', slug: orgSlug, type: 'team' },
  });
}

function mockAddEndpoint(opts?: { fail?: boolean; statusCode?: number }) {
  let requestBody: any;
  client.scenario.post(
    `/v1/projects/${projectId}/crons/definitions`,
    (req, res) => {
      requestBody = req.body;
      if (opts?.fail) {
        const code = opts.statusCode ?? 500;
        if (code === 409) {
          res.status(409).json({
            error: {
              message: 'A cron definition with this path already exists',
              code: 'conflict',
            },
          });
        } else {
          res.status(code).json({
            error: {
              message: 'Internal Server Error',
              code: 'internal_error',
            },
          });
        }
        return;
      }
      res.status(201).json({
        definitions: [
          {
            host: 'example.vercel.app',
            path: req.body.path,
            schedule: req.body.schedule,
            source: 'api',
          },
        ],
      });
    }
  );
  return { getRequestBody: () => requestBody };
}

describe('crons add', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
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
    it('adds cron via API call', async () => {
      mockLinkedProject();
      const { getRequestBody } = mockAddEndpoint();

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

      expect(getRequestBody()).toEqual({
        path: '/api/cron',
        schedule: '0 10 * * *',
      });
      await expect(client.stderr).toOutput('Added cron job');
    });

    it('includes host when provided', async () => {
      mockLinkedProject();
      const { getRequestBody } = mockAddEndpoint();

      client.setArgv(
        'crons',
        'add',
        '--path',
        '/api/cron',
        '--schedule',
        '0 10 * * *',
        '--host',
        'custom.vercel.app'
      );
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);

      expect(getRequestBody()).toEqual({
        path: '/api/cron',
        schedule: '0 10 * * *',
        host: 'custom.vercel.app',
      });
    });

    it('includes description when provided', async () => {
      mockLinkedProject();
      const { getRequestBody } = mockAddEndpoint();

      client.setArgv(
        'crons',
        'add',
        '--path',
        '/api/cron',
        '--schedule',
        '0 10 * * *',
        '--description',
        'Daily cleanup job'
      );
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);

      expect(getRequestBody()).toEqual({
        path: '/api/cron',
        schedule: '0 10 * * *',
        description: 'Daily cleanup job',
      });
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

  describe('API error handling', () => {
    it('handles duplicate path conflict', async () => {
      mockLinkedProject();
      mockAddEndpoint({ fail: true, statusCode: 409 });

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
      await expect(client.stderr).toOutput('Failed to add cron job');
    });

    it('handles server errors', async () => {
      mockLinkedProject();
      mockAddEndpoint({ fail: true, statusCode: 500 });

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
      await expect(client.stderr).toOutput('Failed to add cron job');
    });
  });

  describe('not linked', () => {
    it('errors when project is not linked', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        status: 'not_linked',
      } as any);
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
      await expect(client.stderr).toOutput("isn't linked");
    });
  });

  describe('interactive mode', () => {
    it('prompts for path and schedule', async () => {
      mockLinkedProject();
      mockAddEndpoint();

      client.setArgv('crons', 'add');
      const exitCodePromise = crons(client);

      await expect(client.stderr).toOutput('API route path');
      client.stdin.write('/api/cron\n');

      await expect(client.stderr).toOutput('cron schedule expression');
      client.stdin.write('0 0 * * *\n');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Added cron job');
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
      mockLinkedProject();
      mockAddEndpoint();

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
