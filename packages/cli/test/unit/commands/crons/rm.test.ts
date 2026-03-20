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

function mockProjectWithCrons(
  definitions: {
    host: string;
    path: string;
    schedule: string;
    source?: 'api';
  }[]
) {
  client.scenario.get(`/v9/projects/${projectId}`, (_req, res) => {
    res.json({
      id: projectId,
      name: projectName,
      crons: {
        definitions,
        disabledAt: null,
        enabledAt: 1700000000000,
      },
    });
  });
}

function mockDeleteEndpoint(opts?: { fail?: boolean; statusCode?: number }) {
  let requestBody: any;
  client.scenario.delete(
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
      res.json({ definitions: [] });
    }
  );
  return { getRequestBody: () => requestBody };
}

describe('crons rm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
  });

  describe('--help', () => {
    it('prints help and tracks telemetry', async () => {
      client.setArgv('crons', 'rm', '--help');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'crons:rm' },
      ]);
    });
  });

  describe('with path argument and --yes', () => {
    it('removes cron via API call', async () => {
      mockLinkedProject();
      const { getRequestBody } = mockDeleteEndpoint();

      client.setArgv('crons', 'rm', '/api/cron', '--yes');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);

      expect(getRequestBody()).toEqual({ path: '/api/cron' });
      await expect(client.stderr).toOutput('Removed cron job');
    });
  });

  describe('confirmation prompt', () => {
    it('prompts for confirmation and proceeds on yes', async () => {
      mockLinkedProject();
      mockDeleteEndpoint();

      client.setArgv('crons', 'rm', '/api/cron');
      const exitCodePromise = crons(client);

      await expect(client.stderr).toOutput('Remove cron job');
      client.stdin.write('y\n');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Removed cron job');
    });

    it('aborts when user declines confirmation', async () => {
      mockLinkedProject();

      client.setArgv('crons', 'rm', '/api/cron');
      const exitCodePromise = crons(client);

      await expect(client.stderr).toOutput('Remove cron job');
      client.stdin.write('n\n');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Aborted');
    });

    it('errors in non-interactive mode without --yes', async () => {
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
      client.setArgv('crons', 'rm', '/api/cron');
      (client.stdin as any).isTTY = false;

      const exitCode = await crons(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Confirmation required');
    });
  });

  describe('interactive selection', () => {
    it('auto-selects when only one API-managed cron exists', async () => {
      mockLinkedProject();
      mockProjectWithCrons([
        {
          host: 'example.vercel.app',
          path: '/api/cron',
          schedule: '0 * * * *',
          source: 'api',
        },
      ]);
      mockDeleteEndpoint();

      client.setArgv('crons', 'rm', '--yes');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Auto-selected');
    });

    it('prompts for selection with multiple API-managed crons', async () => {
      mockLinkedProject();
      mockProjectWithCrons([
        {
          host: 'example.vercel.app',
          path: '/api/cron1',
          schedule: '0 * * * *',
          source: 'api',
        },
        {
          host: 'example.vercel.app',
          path: '/api/cron2',
          schedule: '0 0 * * *',
          source: 'api',
        },
      ]);
      mockDeleteEndpoint();

      client.setArgv('crons', 'rm', '--yes');
      const exitCodePromise = crons(client);

      await expect(client.stderr).toOutput('Which cron job');
      client.stdin.write('\n'); // select first option

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });

    it('errors when no API-managed crons exist', async () => {
      mockLinkedProject();
      mockProjectWithCrons([
        {
          host: 'example.vercel.app',
          path: '/api/cron',
          schedule: '0 * * * *',
          // no source: 'api' — this is deployment-sourced
        },
      ]);

      client.setArgv('crons', 'rm', '--yes');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('No API-managed cron jobs found');
    });

    it('errors in non-interactive mode without path', async () => {
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
      client.setArgv('crons', 'rm', '--yes');
      (client.stdin as any).isTTY = false;

      const exitCode = await crons(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('required in non-interactive');
    });
  });

  describe('API error handling', () => {
    it('handles not found error', async () => {
      mockLinkedProject();
      mockDeleteEndpoint({ fail: true, statusCode: 404 });

      client.setArgv('crons', 'rm', '/api/nonexistent', '--yes');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Failed to remove cron job');
    });
  });

  describe('not linked', () => {
    it('errors when project is not linked', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        status: 'not_linked',
      } as any);
      client.setArgv('crons', 'rm', '/api/cron', '--yes');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput("isn't linked");
    });
  });

  describe('telemetry', () => {
    it('tracks subcommand and path argument', async () => {
      mockLinkedProject();
      mockDeleteEndpoint();

      client.setArgv('crons', 'rm', '/api/cron', '--yes');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:rm', value: 'rm' },
        { key: 'argument:path', value: '[REDACTED]' },
      ]);
    });
  });
});
