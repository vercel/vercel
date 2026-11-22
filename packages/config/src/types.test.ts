import { describe, expect, expectTypeOf, it } from 'vitest';
import type { FunctionConfig, ScheduleDefinition, VercelConfig } from './types';

describe('FunctionConfig', () => {
  it('accepts maxConcurrency', () => {
    const config: FunctionConfig = { maxConcurrency: 8 };

    expect(config.maxConcurrency).toBe(8);
  });

  it('accepts schedule triggers', () => {
    const config: FunctionConfig = {
      experimentalTriggers: [{ type: 'schedule/v1beta' }],
    };

    expect(config.experimentalTriggers?.[0]?.type).toBe('schedule/v1beta');
  });
});

describe('VercelConfig skipMiddlewareRequestBody', () => {
  it('accepts an omitted option', () => {
    const config: VercelConfig = {};

    expect(config.skipMiddlewareRequestBody).toBeUndefined();
  });

  it.each([false, true])('accepts %s', skipMiddlewareRequestBody => {
    const config: VercelConfig = { skipMiddlewareRequestBody };

    expect(config.skipMiddlewareRequestBody).toBe(skipMiddlewareRequestBody);
  });

  it('requires an optional boolean', () => {
    expectTypeOf<VercelConfig['skipMiddlewareRequestBody']>().toEqualTypeOf<
      boolean | undefined
    >();
  });

  it('rejects non-boolean values', () => {
    expectTypeOf<string>().not.toExtend<
      VercelConfig['skipMiddlewareRequestBody']
    >();
    expectTypeOf<number>().not.toExtend<
      VercelConfig['skipMiddlewareRequestBody']
    >();
    expectTypeOf<null>().not.toExtend<
      VercelConfig['skipMiddlewareRequestBody']
    >();
    expectTypeOf<unknown[]>().not.toExtend<
      VercelConfig['skipMiddlewareRequestBody']
    >();
    expectTypeOf<object>().not.toExtend<
      VercelConfig['skipMiddlewareRequestBody']
    >();
  });
});

describe('VercelConfig schedules', () => {
  it('accepts schedules keyed by name', () => {
    const schedules: Record<string, ScheduleDefinition> = {
      cleanup: { schedule: '0 0 * * *', path: '/api/cron' },
      sync: { schedule: '0 * * * *', function: 'api/sync', jitter: 5 },
      fanout: {
        schedule: '*/5 * * * *',
        topic: 'jobs',
        timezone: 'America/New_York',
      },
      nightly: { schedule: '0 3 * * *', entrypoint: 'jobs/nightly.py' },
    };
    const config: VercelConfig = { schedules };

    expect(Object.keys(schedules)).toHaveLength(4);
    expect(config.schedules).toBe(schedules);
  });

  it('accepts requestMethod only on path schedules', () => {
    const get: ScheduleDefinition = {
      schedule: '0 0 * * *',
      path: '/api/cron',
      requestMethod: 'GET',
    };
    const topic: ScheduleDefinition = {
      schedule: '0 0 * * *',
      topic: 'jobs',
      // @ts-expect-error requestMethod requires a path target
      requestMethod: 'GET',
    };
    const put: ScheduleDefinition = {
      schedule: '0 0 * * *',
      path: '/api/cron',
      // @ts-expect-error requestMethod must be GET or POST
      requestMethod: 'PUT',
    };

    expect([get, topic, put]).toHaveLength(3);
  });

  it('rejects schedules without exactly one target', () => {
    // @ts-expect-error a target field is required
    const missingTarget: ScheduleDefinition = {
      schedule: '0 0 * * *',
    };
    // @ts-expect-error exactly one target field is required
    const multipleTargets: ScheduleDefinition = {
      schedule: '0 0 * * *',
      path: '/api/cron',
      topic: 'jobs',
    };

    expect([missingTarget, multipleTargets]).toHaveLength(2);
  });
});
