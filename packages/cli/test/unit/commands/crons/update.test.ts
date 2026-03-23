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

function mockUpdateEndpoint(opts?: { fail?: boolean; statusCode?: number }) {
  let requestBody: any;
  client.scenario.patch(
    `/v1/projects/${projectId}/crons/definitions`,
    (req, res) => {
      requestBody = req.body;
      if (opts?.fail) {
        const code = opts.statusCode ?? 500;
        if (code === 404) {
          res.status(404).json({
            error: {
              message: 'Cron definition not found',
              code: 'not_found',
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
      res.json({
        definitions: [
          {
            host: req.body.host ?? 'example.vercel.app',
            path: req.body.path,
            schedule: req.body.schedule ?? '0 0 * * *',
            source: 'api',
          },
        ],
      });
    }
  );
  return { getRequestBody: () => requestBody };
}

describe('crons update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
  });

  describe('--help', () => {
    it('prints help and tracks telemetry', async () => {
      client.setArgv('crons', 'update', '--help');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'crons:update' },
      ]);
    });
  });

  describe('with flags', () => {
    it('updates cron schedule via API', async () => {
      mockLinkedProject();
      const { getRequestBody } = mockUpdateEndpoint();

      client.setArgv(
        'crons',
        'update',
        '--path',
        '/api/cron',
        '--schedule',
        '0 0 * * *'
      );
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);

      expect(getRequestBody()).toEqual({
        path: '/api/cron',
        schedule: '0 0 * * *',
      });
      await expect(client.stderr).toOutput('Updated cron job');
    });

    it('updates cron host via API', async () => {
      mockLinkedProject();
      const { getRequestBody } = mockUpdateEndpoint();

      client.setArgv(
        'crons',
        'update',
        '--path',
        '/api/cron',
        '--host',
        'custom.vercel.app'
      );
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);

      expect(getRequestBody()).toEqual({
        path: '/api/cron',
        host: 'custom.vercel.app',
      });
      await expect(client.stderr).toOutput('Updated cron job');
    });

    it('updates both schedule and host', async () => {
      mockLinkedProject();
      const { getRequestBody } = mockUpdateEndpoint();

      client.setArgv(
        'crons',
        'update',
        '--path',
        '/api/cron',
        '--schedule',
        '*/5 * * * *',
        '--host',
        'custom.vercel.app'
      );
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);

      expect(getRequestBody()).toEqual({
        path: '/api/cron',
        schedule: '*/5 * * * *',
        host: 'custom.vercel.app',
      });
    });

    it('updates description via API', async () => {
      mockLinkedProject();
      const { getRequestBody } = mockUpdateEndpoint();

      client.setArgv(
        'crons',
        'update',
        '--path',
        '/api/cron',
        '--description',
        'Updated cleanup job'
      );
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);

      expect(getRequestBody()).toEqual({
        path: '/api/cron',
        description: 'Updated cleanup job',
      });
      await expect(client.stderr).toOutput('Updated cron job');
    });
  });

  describe('validation', () => {
    it('rejects path not starting with /', async () => {
      client.setArgv(
        'crons',
        'update',
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
        'update',
        '--path',
        '/api/cron',
        '--schedule',
        'invalid'
      );
      const exitCode = await crons(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('must have exactly 5 fields');
    });
  });

  describe('API error handling', () => {
    it('handles not found error', async () => {
      mockLinkedProject();
      mockUpdateEndpoint({ fail: true, statusCode: 404 });

      client.setArgv(
        'crons',
        'update',
        '--path',
        '/api/nonexistent',
        '--schedule',
        '0 0 * * *'
      );
      const exitCode = await crons(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Failed to update cron job');
    });
  });

  describe('not linked', () => {
    it('errors when project is not linked', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        status: 'not_linked',
      } as any);
      client.setArgv(
        'crons',
        'update',
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
    it('prompts for path and schedule when not provided', async () => {
      mockLinkedProject();
      mockUpdateEndpoint();

      client.setArgv('crons', 'update');
      const exitCodePromise = crons(client);

      await expect(client.stderr).toOutput('path of the cron job to update');
      client.stdin.write('/api/cron\n');

      await expect(client.stderr).toOutput('new cron schedule expression');
      client.stdin.write('0 0 * * *\n');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });

    it('errors in non-interactive mode without path', async () => {
      client.setArgv('crons', 'update');
      (client.stdin as any).isTTY = false;

      const exitCode = await crons(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Missing required flag --path');
    });

    it('errors in non-interactive mode with path but no schedule, host, or description', async () => {
      client.setArgv('crons', 'update', '--path', '/api/cron');
      (client.stdin as any).isTTY = false;

      const exitCode = await crons(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'At least one of --schedule, --host, or --description'
      );
    });
  });

  describe('telemetry', () => {
    it('tracks subcommand and options', async () => {
      mockLinkedProject();
      mockUpdateEndpoint();

      client.setArgv(
        'crons',
        'update',
        '--path',
        '/api/cron',
        '--schedule',
        '0 0 * * *'
      );
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:update', value: 'update' },
        { key: 'option:path', value: '[REDACTED]' },
        { key: 'option:schedule', value: '[REDACTED]' },
      ]);
    });
  });
});
