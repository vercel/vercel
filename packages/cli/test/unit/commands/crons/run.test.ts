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
  definitions: { host: string; path: string; schedule: string }[]
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

function mockRunEndpoint(opts?: { fail?: boolean; statusCode?: number }) {
  let requestBody: any;
  client.scenario.post(`/v1/projects/${projectId}/crons/run`, (req, res) => {
    requestBody = req.body;
    if (opts?.fail) {
      res.status(opts.statusCode ?? 500).json({
        error: { message: 'Internal Server Error', code: 'internal_error' },
      });
      return;
    }
    res.json({ invocationAt: Date.now() });
  });
  return { getRequestBody: () => requestBody };
}

describe('crons run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
  });

  describe('--help', () => {
    it('prints help and tracks telemetry', async () => {
      client.setArgv('crons', 'run', '--help');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'crons:run' },
      ]);
    });
  });

  describe('not linked', () => {
    it('errors when project is not linked', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        status: 'not_linked',
      } as any);
      client.setArgv('crons', 'run', '/api/cron');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput("isn't linked");
    });
  });

  describe('with path argument', () => {
    it('triggers cron job successfully', async () => {
      mockLinkedProject();
      mockProjectWithCrons([
        {
          host: 'example.vercel.app',
          path: '/api/cron',
          schedule: '0 * * * *',
        },
      ]);
      const { getRequestBody } = mockRunEndpoint();

      client.setArgv('crons', 'run', '/api/cron');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('triggered');
      expect(getRequestBody()).toEqual({
        path: '/api/cron',
        schedule: '0 * * * *',
      });
    });

    it('errors when cron path not found', async () => {
      mockLinkedProject();
      mockProjectWithCrons([
        {
          host: 'example.vercel.app',
          path: '/api/cron',
          schedule: '0 * * * *',
        },
      ]);
      client.setArgv('crons', 'run', '/api/nonexistent');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('not found');
    });

    it('errors when no cron jobs exist', async () => {
      mockLinkedProject();
      mockProjectWithCrons([]);
      client.setArgv('crons', 'run', '/api/cron');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('No cron jobs found');
    });

    it('errors when crons are disabled', async () => {
      mockLinkedProject();
      client.scenario.get(`/v9/projects/${projectId}`, (_req, res) => {
        res.json({
          id: projectId,
          name: projectName,
          crons: {
            definitions: [
              {
                host: 'example.vercel.app',
                path: '/api/cron',
                schedule: '0 * * * *',
              },
            ],
            disabledAt: 1700000000000,
            enabledAt: 1700000000000,
          },
        });
      });
      client.setArgv('crons', 'run', '/api/cron');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('disabled');
    });
  });

  describe('API error handling', () => {
    it('handles API errors from run endpoint', async () => {
      mockLinkedProject();
      mockProjectWithCrons([
        {
          host: 'example.vercel.app',
          path: '/api/cron',
          schedule: '0 * * * *',
        },
      ]);
      mockRunEndpoint({ fail: true, statusCode: 403 });

      client.setArgv('crons', 'run', '/api/cron');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Failed to trigger');
    });
  });

  describe('interactive selection', () => {
    it('auto-selects when only one cron job exists', async () => {
      mockLinkedProject();
      mockProjectWithCrons([
        {
          host: 'example.vercel.app',
          path: '/api/cron',
          schedule: '0 * * * *',
        },
      ]);
      mockRunEndpoint();

      client.setArgv('crons', 'run');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Auto-selected');
    });

    it('prompts for selection with multiple crons', async () => {
      mockLinkedProject();
      mockProjectWithCrons([
        {
          host: 'example.vercel.app',
          path: '/api/cron1',
          schedule: '0 * * * *',
        },
        {
          host: 'example.vercel.app',
          path: '/api/cron2',
          schedule: '0 0 * * *',
        },
      ]);
      mockRunEndpoint();

      client.setArgv('crons', 'run');
      const exitCodePromise = crons(client);

      await expect(client.stderr).toOutput('Which cron job');
      client.stdin.write('\n'); // select first option

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });

    it('errors in non-interactive mode without path', async () => {
      mockLinkedProject();
      mockProjectWithCrons([
        {
          host: 'example.vercel.app',
          path: '/api/cron',
          schedule: '0 * * * *',
        },
      ]);

      client.setArgv('crons', 'run');
      client.nonInteractive = true;

      const exitCode = await crons(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('required in non-interactive');
    });
  });

  describe('telemetry', () => {
    it('tracks subcommand and path argument', async () => {
      mockLinkedProject();
      mockProjectWithCrons([
        {
          host: 'example.vercel.app',
          path: '/api/cron',
          schedule: '0 * * * *',
        },
      ]);
      mockRunEndpoint();

      client.setArgv('crons', 'run', '/api/cron');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:run', value: 'run' },
        { key: 'argument:path', value: '[REDACTED]' },
      ]);
    });
  });
});
