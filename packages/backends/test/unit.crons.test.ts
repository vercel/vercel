import { describe, expect, it } from 'vitest';
import { getServiceCrons } from '../src/crons';

describe('getServiceCrons', () => {
  it('returns undefined for non-schedule-triggered services', () => {
    expect(
      getServiceCrons({
        service: { type: 'web', name: 'web', schedule: '0 0 * * *' },
        entrypoint: 'server.ts',
      })
    ).toBeUndefined();
    expect(
      getServiceCrons({
        service: {
          type: 'job',
          trigger: 'queue',
          name: 'worker',
          schedule: '0 0 * * *',
        },
        entrypoint: 'worker.ts',
      })
    ).toBeUndefined();
    expect(getServiceCrons({ entrypoint: 'cleanup.ts' })).toBeUndefined();
  });

  it('returns undefined when name or schedule is missing', () => {
    expect(
      getServiceCrons({
        service: { type: 'cron', schedule: '0 0 * * *' },
        entrypoint: 'cleanup.ts',
      })
    ).toBeUndefined();
    expect(
      getServiceCrons({
        service: { type: 'cron', name: 'cleanup' },
        entrypoint: 'cleanup.ts',
      })
    ).toBeUndefined();
  });

  it('produces a single entry for a static schedule on a cron service', () => {
    expect(
      getServiceCrons({
        service: { type: 'cron', name: 'cleanup', schedule: '0 0 * * *' },
        entrypoint: 'cleanup.ts',
      })
    ).toEqual([
      {
        path: '/_svc/cleanup/crons/cleanup/cron',
        schedule: '0 0 * * *',
      },
    ]);
  });

  it('produces a single entry for a schedule-triggered job', () => {
    expect(
      getServiceCrons({
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
      },
    ]);
  });

  it('throws when entrypoint is missing for a cron service', () => {
    expect(() =>
      getServiceCrons({
        service: { type: 'cron', name: 'cleanup', schedule: '0 0 * * *' },
      })
    ).toThrow(/missing an entrypoint/);
  });

  it('throws on a <dynamic> schedule (not yet supported for JS/TS)', () => {
    expect(() =>
      getServiceCrons({
        service: { type: 'cron', name: 'cleanup', schedule: '<dynamic>' },
        entrypoint: 'cleanup.ts',
      })
    ).toThrow(/Dynamic cron schedules .* not yet supported/);
  });
});
