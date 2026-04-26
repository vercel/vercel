import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

// Pinned to 2024-01-15T12:30:00.000Z for deterministic next/previous run
// times. With this anchor, `0 * * * *` lands at 13:00:00 next and 12:00:00
// previous, giving 30m on either side.
const NOW = new Date('2024-01-15T12:30:00.000Z');

describe('crons ls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Only fake `Date` — the mock-client's `toOutput` helper relies on real
    // timers to poll stderr, so faking setTimeout/setInterval would hang it.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    client.reset();
    mockedReadLocalConfig.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
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
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Next Run');
      expect(stderr).toContain('Previous Run');
      expect(stderr).toContain('in 30m');
      expect(stderr).toContain('30m ago');
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
          nextRun: '2024-01-15T13:00:00.000Z',
          previousRun: '2024-01-15T12:00:00.000Z',
        },
      ]);
      expect(parsed.enabled).toBe(true);
    });

    it('emits null next/previous for invalid schedules', async () => {
      mockLinkedProject();
      mockProjectWithCrons([
        {
          host: 'example.vercel.app',
          path: '/api/cron',
          schedule: 'not a cron',
        },
      ]);
      client.setArgv('crons', 'ls', '--format', 'json');
      const exitCode = await crons(client);
      expect(exitCode).toEqual(0);

      const stdout = client.stdout.getFullOutput();
      const parsed = JSON.parse(stdout);
      expect(parsed.crons[0].nextRun).toBeNull();
      expect(parsed.crons[0].previousRun).toBeNull();
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
        {
          path: '/api/new',
          schedule: '*/5 * * * *',
          nextRun: '2024-01-15T12:35:00.000Z',
          previousRun: '2024-01-15T12:25:00.000Z',
        },
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

  // Cron times are computed from absolute epoch deltas with `tz: 'UTC'`, so
  // the system timezone should not influence the result. This guards against
  // someone accidentally introducing local-time math (e.g. `getHours()` in
  // place of `getUTCHours()`) in a future change.
  describe('timezone independence', () => {
    it.each([
      'UTC',
      'America/New_York',
      'Asia/Tokyo',
    ])('computes identical next/previous regardless of system TZ (TZ=%s)', async tz => {
      const originalTz = process.env.TZ;
      process.env.TZ = tz;
      try {
        mockLinkedProject();
        mockProjectWithCrons([
          {
            host: 'example.vercel.app',
            path: '/api/hourly',
            schedule: '0 * * * *',
          },
        ]);
        client.setArgv('crons', 'ls', '--format', 'json');
        const exitCode = await crons(client);
        expect(exitCode).toEqual(0);
        const parsed = JSON.parse(client.stdout.getFullOutput());
        expect(parsed.crons[0].nextRun).toBe('2024-01-15T13:00:00.000Z');
        expect(parsed.crons[0].previousRun).toBe('2024-01-15T12:00:00.000Z');
      } finally {
        process.env.TZ = originalTz;
      }
    });
  });

  // Locks in the rounding/granularity behavior at and beyond the 24h boundary.
  // The `ms` package (short mode) rounds to whole days for any delta >= 24h
  // and never escalates to weeks/months/years, so a yearly schedule renders
  // as e.g. "in 351d". If we ever swap formatters, these assertions will
  // surface the change.
  describe('day-and-longer ranges', () => {
    it.each([
      {
        kind: 'weekly',
        schedule: '15 3 * * 0',
        next: '2024-01-21T03:15:00.000Z',
        previous: '2024-01-14T03:15:00.000Z',
        tableNext: 'in 6d',
        tablePrevious: '1d ago',
      },
      {
        kind: 'monthly',
        schedule: '0 0 1 * *',
        next: '2024-02-01T00:00:00.000Z',
        previous: '2024-01-01T00:00:00.000Z',
        tableNext: 'in 16d',
        tablePrevious: '15d ago',
      },
      {
        kind: 'yearly',
        schedule: '0 0 1 1 *',
        next: '2025-01-01T00:00:00.000Z',
        previous: '2024-01-01T00:00:00.000Z',
        tableNext: 'in 351d',
        tablePrevious: '15d ago',
      },
    ])('renders $kind schedule with day granularity', async ({
      schedule,
      next,
      previous,
      tableNext,
      tablePrevious,
    }) => {
      mockLinkedProject();
      mockProjectWithCrons([
        { host: 'example.vercel.app', path: '/api/cron', schedule },
      ]);

      client.setArgv('crons', 'ls', '--format', 'json');
      expect(await crons(client)).toEqual(0);
      const parsed = JSON.parse(client.stdout.getFullOutput());
      expect(parsed.crons[0].nextRun).toBe(next);
      expect(parsed.crons[0].previousRun).toBe(previous);

      // Re-run for the human/table view. `client.reset()` clears the mock
      // server's routes, so re-register them before the second invocation.
      client.reset();
      mockedReadLocalConfig.mockReturnValue(undefined);
      mockLinkedProject();
      mockProjectWithCrons([
        { host: 'example.vercel.app', path: '/api/cron', schedule },
      ]);

      client.setArgv('crons', 'ls');
      expect(await crons(client)).toEqual(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(tableNext);
      expect(stderr).toContain(tablePrevious);
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
