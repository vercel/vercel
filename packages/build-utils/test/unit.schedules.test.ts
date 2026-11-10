import { describe, expect, it } from 'vitest';
import { getNamedSchedules, toScheduleRecord } from '../src/schedules';

describe('getNamedSchedules', () => {
  it('names schedules keyed by name, in key order', () => {
    expect(
      getNamedSchedules({
        nightly: { schedule: '0 0 * * *', path: '/api/cron' },
        drain: { schedule: '*/5 * * * *', topic: 'jobs' },
      })
    ).toEqual([
      { name: 'nightly', schedule: '0 0 * * *', path: '/api/cron' },
      { name: 'drain', schedule: '*/5 * * * *', topic: 'jobs' },
    ]);
  });

  it('returns no schedules when there are none', () => {
    expect(getNamedSchedules(undefined)).toEqual([]);
  });
});

describe('toScheduleRecord', () => {
  it('keys named schedules by name', () => {
    const schedules = {
      nightly: { schedule: '0 0 * * *', path: '/api/cron' },
      drain: { schedule: '*/5 * * * *', topic: 'jobs' },
    };
    expect(toScheduleRecord(getNamedSchedules(schedules))).toEqual(schedules);
  });
});
