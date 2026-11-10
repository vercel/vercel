import { describe, expect, it } from 'vitest';
import { buildCronRouteTable, getServiceCrons } from '../src/crons';

describe('getServiceCrons', () => {
  it('returns undefined for non-schedule-triggered services', async () => {
    expect(
      await getServiceCrons({
        service: { type: 'web', name: 'web', schedule: '0 0 * * *' },
        entrypoint: 'server.ts',
      })
    ).toBeUndefined();
    expect(
      await getServiceCrons({
        service: {
          type: 'job',
          trigger: 'queue',
          name: 'worker',
          schedule: '0 0 * * *',
        },
        entrypoint: 'worker.ts',
      })
    ).toBeUndefined();
    expect(await getServiceCrons({ entrypoint: 'cleanup.ts' })).toBeUndefined();
  });

  it('returns undefined when name or schedule is missing', async () => {
    expect(
      await getServiceCrons({
        service: { type: 'cron', schedule: '0 0 * * *' },
        entrypoint: 'cleanup.ts',
      })
    ).toBeUndefined();
    expect(
      await getServiceCrons({
        service: { type: 'cron', name: 'cleanup' },
        entrypoint: 'cleanup.ts',
      })
    ).toBeUndefined();
  });

  it('produces a single entry for a static schedule on a cron service', async () => {
    expect(
      await getServiceCrons({
        service: { type: 'cron', name: 'cleanup', schedule: '0 0 * * *' },
        entrypoint: 'cleanup.ts',
      })
    ).toEqual([
      {
        path: '/_svc/cleanup/crons/cleanup/cron',
        schedule: '0 0 * * *',
        exportName: 'default',
      },
    ]);
  });

  it('produces a single entry for a schedule-triggered job', async () => {
    expect(
      await getServiceCrons({
        service: {
          type: 'job',
          trigger: 'schedule',
          name: 'cleanup',
          schedule: '*/5 * * * *',
        },
        entrypoint: 'jobs/cleanup.ts',
      })
    ).toEqual([
      {
        path: '/_svc/cleanup/crons/jobs/cleanup/cron',
        schedule: '*/5 * * * *',
        exportName: 'default',
      },
    ]);
  });

  it('throws when entrypoint is missing for a cron service', async () => {
    await expect(
      getServiceCrons({
        service: { type: 'cron', name: 'cleanup', schedule: '0 0 * * *' },
      })
    ).rejects.toThrow(/missing an entrypoint/);
  });

  it('throws on a <dynamic> schedule (not yet supported for JS/TS)', async () => {
    await expect(
      getServiceCrons({
        service: { type: 'cron', name: 'cleanup', schedule: '<dynamic>' },
        entrypoint: 'cleanup.ts',
      })
    ).rejects.toThrow(/Dynamic cron schedules .* not yet supported/);
  });
});

describe('buildCronRouteTable', () => {
  it('maps each entry path to its handler', () => {
    expect(
      buildCronRouteTable([
        {
          path: '/_svc/cleanup/crons/cleanup/cron',
          schedule: '0 0 * * *',
          exportName: 'default',
        },
        {
          path: '/_svc/jobs/crons/jobs/hourly',
          schedule: '0 * * * *',
          exportName: 'hourly',
        },
      ])
    ).toEqual({
      '/_svc/cleanup/crons/cleanup/cron': 'default',
      '/_svc/jobs/crons/jobs/hourly': 'hourly',
    });
  });
});
