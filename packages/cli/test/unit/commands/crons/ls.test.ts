import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import crons from '../../../../src/commands/crons';
import * as linkModule from '../../../../src/util/projects/link';
import * as configFiles from '../../../../src/util/config/files';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/config/files', async importOriginal => {
  const actual = await importOriginal<typeof configFiles>();
  return {
    ...actual,
    readLocalConfig: vi.fn(),
  };
});

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedReadLocalConfig = vi.mocked(configFiles.readLocalConfig);

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
  definitions: { host: string; path: string; schedule: string }[],
  opts?: { disabledAt?: number | null }
) {
  client.scenario.get(`/v9/projects/${projectId}`, (_req, res) => {
    res.json({
      id: projectId,
      name: projectName,
      crons: {
        definitions,
        disabledAt: opts?.disabledAt ?? null,
        enabledAt: 1700000000000,
      },
    });
  });
}

describe('crons ls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockedReadLocalConfig.mockReturnValue(undefined);
  });

  describe('--help', () => {
    it('prints help and tracks telemetry', async () => {
      client.setArgv('crons', 'ls', '--help');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'crons:ls' },
      ]);
    });
  });

  describe('not linked', () => {
    it('errors when project is not linked', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        status: 'not_linked',
      } as any);
      client.setArgv('crons', 'ls');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput("isn't linked");
    });
  });

  describe('with deployed crons', () => {
    it('lists cron jobs in table format', async () => {
      mockLinkedProject();
      mockProjectWithCrons([
        {
          host: 'example.vercel.app',
          path: '/api/cron',
          schedule: '0 * * * *',
        },
        {
          host: 'example.vercel.app',
          path: '/api/daily',
          schedule: '0 0 * * *',
        },
      ]);
      client.setArgv('crons', 'ls');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('2 cron jobs found');
    });

    it('shows disabled indicator', async () => {
      mockLinkedProject();
      mockProjectWithCrons(
        [
          {
            host: 'example.vercel.app',
            path: '/api/cron',
            schedule: '0 * * * *',
          },
        ],
        { disabledAt: 1700000000000 }
      );
      client.setArgv('crons', 'ls');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('(disabled)');
    });

    it('shows no crons message when empty', async () => {
      mockLinkedProject();
      mockProjectWithCrons([]);
      client.setArgv('crons', 'ls');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('No cron jobs found');
    });
  });

  describe('JSON output', () => {
    it('outputs JSON with --format json', async () => {
      mockLinkedProject();
      mockProjectWithCrons([
        {
          host: 'example.vercel.app',
          path: '/api/cron',
          schedule: '0 * * * *',
        },
      ]);
      client.setArgv('crons', 'ls', '--format', 'json');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);

      const stdout = client.stdout.getFullOutput();
      const parsed = JSON.parse(stdout);
      expect(parsed.crons).toEqual([
        {
          path: '/api/cron',
          schedule: '0 * * * *',
          host: 'example.vercel.app',
        },
      ]);
      expect(parsed.enabled).toBe(true);
    });

    it('includes undeployed and modified in JSON', async () => {
      mockLinkedProject();
      mockProjectWithCrons([
        {
          host: 'example.vercel.app',
          path: '/api/cron',
          schedule: '0 * * * *',
        },
      ]);
      mockedReadLocalConfig.mockReturnValue({
        crons: [
          { path: '/api/cron', schedule: '0 0 * * *' }, // modified
          { path: '/api/new', schedule: '*/5 * * * *' }, // undeployed
        ],
      } as any);
      client.setArgv('crons', 'ls', '--format', 'json');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);

      const stdout = client.stdout.getFullOutput();
      const parsed = JSON.parse(stdout);
      expect(parsed.undeployed).toEqual([
        { path: '/api/new', schedule: '*/5 * * * *' },
      ]);
      expect(parsed.modified).toEqual([
        {
          path: '/api/cron',
          localSchedule: '0 0 * * *',
          deployedSchedule: '0 * * * *',
        },
      ]);
    });
  });

  describe('local config comparison', () => {
    it('shows undeployed crons from vercel.json', async () => {
      mockLinkedProject();
      mockProjectWithCrons([]);
      mockedReadLocalConfig.mockReturnValue({
        crons: [{ path: '/api/new-cron', schedule: '0 0 * * *' }],
      } as any);
      client.setArgv('crons', 'ls');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('1 local change pending deploy');
    });

    it('shows modified crons with schedule changes', async () => {
      mockLinkedProject();
      mockProjectWithCrons([
        {
          host: 'example.vercel.app',
          path: '/api/cron',
          schedule: '0 * * * *',
        },
      ]);
      mockedReadLocalConfig.mockReturnValue({
        crons: [{ path: '/api/cron', schedule: '0 0 * * *' }],
      } as any);
      client.setArgv('crons', 'ls');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('1 local change pending deploy');
    });

    it('does not show pending section when local matches deployed', async () => {
      mockLinkedProject();
      mockProjectWithCrons([
        {
          host: 'example.vercel.app',
          path: '/api/cron',
          schedule: '0 * * * *',
        },
      ]);
      mockedReadLocalConfig.mockReturnValue({
        crons: [{ path: '/api/cron', schedule: '0 * * * *' }],
      } as any);
      client.setArgv('crons', 'ls');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('1 cron job found');
    });

    it('handles missing local config gracefully', async () => {
      mockLinkedProject();
      mockProjectWithCrons([
        {
          host: 'example.vercel.app',
          path: '/api/cron',
          schedule: '0 * * * *',
        },
      ]);
      mockedReadLocalConfig.mockReturnValue(undefined);
      client.setArgv('crons', 'ls');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('1 cron job found');
    });
  });

  describe('telemetry', () => {
    it('tracks subcommand invocation', async () => {
      mockLinkedProject();
      mockProjectWithCrons([]);
      client.setArgv('crons', 'ls');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:list', value: 'ls' },
      ]);
    });

    it('tracks format option', async () => {
      mockLinkedProject();
      mockProjectWithCrons([]);
      client.setArgv('crons', 'ls', '--format', 'json');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:list', value: 'ls' },
        { key: 'option:format', value: 'json' },
      ]);
    });
  });

  describe('extra arguments', () => {
    it('rejects extra arguments', async () => {
      client.setArgv('crons', 'ls', 'extra-arg');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(2);
    });
  });
});
