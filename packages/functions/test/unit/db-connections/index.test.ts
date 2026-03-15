import { expect, test, vi, describe, beforeEach, afterEach } from 'vitest';
import { attachDatabasePool } from '../../../src/db-connections';
import { SYMBOL_FOR_REQ_CONTEXT } from '../../../src/get-context';

describe('db-connections', () => {
  const vercelUrl = process.env.VERCEL_URL;
  const vercelRegion = process.env.VERCEL_REGION;

  beforeEach(() => {
    process.env.VERCEL_URL = 'test.vercel.app';
    process.env.VERCEL_REGION = 'iad1';
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
    delete globalThis[SYMBOL_FOR_REQ_CONTEXT];
    process.env.VERCEL_URL = vercelUrl;
    process.env.VERCEL_REGION = vercelRegion;
  });

  describe('supported pool types', () => {
    test('PostgreSQL pool triggers timeout with correct duration', () => {
      const waitUntilMock = vi.fn();
      globalThis[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => ({ waitUntil: waitUntilMock }),
      };

      const pgPool = {
        options: { idleTimeoutMillis: 5000 },
        on: vi.fn(),
      };

      attachDatabasePool(pgPool);
      const releaseCallback = pgPool.on.mock.calls[0][1];
      releaseCallback();

      expect(vi.getTimerCount()).toBe(1);
    });

    test('PostgreSQL pool uses default timeout when idleTimeoutMillis is null', () => {
      const waitUntilMock = vi.fn();
      globalThis[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => ({ waitUntil: waitUntilMock }),
      };

      const pgPool = {
        options: { idleTimeoutMillis: null },
        on: vi.fn(),
      };

      attachDatabasePool(pgPool);
      const releaseCallback = pgPool.on.mock.calls[0][1];
      releaseCallback();

      expect(vi.getTimerCount()).toBe(1);
    });

    test('MongoDB pool triggers timeout with maxIdleTimeMS', () => {
      const waitUntilMock = vi.fn();
      globalThis[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => ({ waitUntil: waitUntilMock }),
      };

      const mongoPool = {
        options: { maxIdleTimeMS: 30000 },
        on: vi.fn(),
      };

      attachDatabasePool(mongoPool);
      const checkedOutCallback = mongoPool.on.mock.calls[0][1];
      checkedOutCallback();

      expect(vi.getTimerCount()).toBe(1);
    });

    test('MySQL pool triggers timeout from config.connectionConfig', () => {
      const waitUntilMock = vi.fn();
      globalThis[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => ({ waitUntil: waitUntilMock }),
      };

      const mysqlPool = {
        config: { connectionConfig: { idleTimeout: 45000 } },
        on: vi.fn(),
      };

      attachDatabasePool(mysqlPool);
      const releaseCallback = mysqlPool.on.mock.calls[0][1];
      releaseCallback();

      expect(vi.getTimerCount()).toBe(1);
    });

    test('MySQL2/MariaDB pool triggers timeout from config', () => {
      const waitUntilMock = vi.fn();
      globalThis[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => ({ waitUntil: waitUntilMock }),
      };

      const mysql2Pool = {
        config: { idleTimeout: 20000 },
        on: vi.fn(),
      };

      attachDatabasePool(mysql2Pool);
      const releaseCallback = mysql2Pool.on.mock.calls[0][1];
      releaseCallback();

      expect(vi.getTimerCount()).toBe(1);
    });

    test('Redis pool triggers timeout on end event', () => {
      const waitUntilMock = vi.fn();
      globalThis[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => ({ waitUntil: waitUntilMock }),
      };

      const redisPool = {
        options: { socket: {} },
        status: 'ready',
        on: vi.fn(),
      };

      attachDatabasePool(redisPool);
      const endCallback = redisPool.on.mock.calls[0][1];
      endCallback();

      expect(vi.getTimerCount()).toBe(1);
    });
  });

  describe('waitUntilIdleTimeout', () => {
    test('sets up idle timeout with request context', async () => {
      const waitUntilMock = vi.fn();
      globalThis[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => ({ waitUntil: waitUntilMock }),
      };

      const pgPool = {
        options: { idleTimeoutMillis: 1000 },
        on: vi.fn(),
      };

      attachDatabasePool(pgPool);

      const releaseCallback = pgPool.on.mock.calls[0][1];
      releaseCallback();

      expect(waitUntilMock).toHaveBeenCalledWith(expect.any(Promise));
      // Note: Debug logs are only shown when DEBUG env var is set at module load time
    });

    test('does not log warning outside request scope when DEBUG is not set', () => {
      // DEBUG is evaluated at module load time, so we verify the default behavior
      // which is to NOT log warnings (fixes log spam issue #14825)
      const pgPool = {
        options: { idleTimeoutMillis: 1000 },
        on: vi.fn(),
      };

      attachDatabasePool(pgPool);

      const releaseCallback = pgPool.on.mock.calls[0][1];
      releaseCallback();

      // Without DEBUG at module load, the warning should NOT be logged
      expect(console.warn).not.toHaveBeenCalledWith(
        'Pool release event triggered outside of request scope.'
      );
    });

    test('clears previous timeout when new one is set', () => {
      const waitUntilMock = vi.fn();
      globalThis[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => ({ waitUntil: waitUntilMock }),
      };

      const pgPool = {
        options: { idleTimeoutMillis: 1000 },
        on: vi.fn(),
      };

      attachDatabasePool(pgPool);

      const releaseCallback = pgPool.on.mock.calls[0][1];
      releaseCallback();
      releaseCallback();

      expect(waitUntilMock).toHaveBeenCalledTimes(2);
    });

    test('respects maximum duration limit', () => {
      const waitUntilMock = vi.fn();
      globalThis[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => ({ waitUntil: waitUntilMock }),
      };

      const originalDateNow = Date.now;
      const mockBootTime = 0;
      Date.now = vi
        .fn()
        .mockReturnValueOnce(mockBootTime)
        .mockReturnValue(14 * 60 * 1000);

      const pgPool = {
        options: { idleTimeoutMillis: 10 * 60 * 1000 },
        on: vi.fn(),
      };

      attachDatabasePool(pgPool);

      const releaseCallback = pgPool.on.mock.calls[0][1];
      releaseCallback();

      expect(waitUntilMock).toHaveBeenCalled();

      Date.now = originalDateNow;
    });

    test('ensures minimum wait time of 100ms when process exceeds maximum duration', () => {
      // This test verifies the fix for TimeoutNegativeWarning in Node.js v24
      // When the process runs longer than 15 minutes, the remaining duration calculation
      // would become negative, causing setTimeout to receive a negative delay
      const waitUntilMock = vi.fn();
      globalThis[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => ({ waitUntil: waitUntilMock }),
      };

      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

      const pgPool = {
        options: { idleTimeoutMillis: 5000 },
        on: vi.fn(),
      };

      attachDatabasePool(pgPool);

      // Simulate that 20 minutes have passed (well beyond the 15 minute maximum)
      // This would make maximumDuration - (Date.now() - bootTime) negative
      vi.setSystemTime(Date.now() + 20 * 60 * 1000);

      const releaseCallback = pgPool.on.mock.calls[0][1];
      releaseCallback();

      // Verify setTimeout was called with a delay of at least 100ms (the minimum)
      const lastSetTimeoutCall =
        setTimeoutSpy.mock.calls[setTimeoutSpy.mock.calls.length - 1];
      const timeoutDelay = lastSetTimeoutCall[1];
      expect(timeoutDelay).toBeGreaterThanOrEqual(100);

      setTimeoutSpy.mockRestore();
    });

    test('timeout expires and resolves promise', async () => {
      const waitUntilMock = vi.fn();
      let resolvePromise: (value: void) => void;
      const waitPromise = new Promise<void>(resolve => {
        resolvePromise = resolve;
      });

      globalThis[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => ({
          waitUntil: (promise: Promise<unknown>) => {
            waitUntilMock(promise);
            promise.then(() => resolvePromise());
          },
        }),
      };

      const pgPool = {
        options: { idleTimeoutMillis: 100 },
        on: vi.fn(),
      };

      attachDatabasePool(pgPool);

      const releaseCallback = pgPool.on.mock.calls[0][1];
      releaseCallback();

      vi.advanceTimersByTime(200);
      await waitPromise;

      // Verify that the timeout mechanism worked (promise resolved)
      expect(waitUntilMock).toHaveBeenCalled();
      // Note: Debug logs are only shown when DEBUG env var is set at module load time
    });
  });

  describe('attachDatabasePool', () => {
    test('attaches release listener to PostgreSQL pool', () => {
      const pgPool = {
        options: { idleTimeoutMillis: 5000 },
        on: vi.fn(),
      };

      attachDatabasePool(pgPool);

      expect(pgPool.on).toHaveBeenCalledWith('release', expect.any(Function));
    });

    test('attaches release listener to MySQL pool', () => {
      const mysqlPool = {
        config: { connectionConfig: { idleTimeout: 45000 } },
        on: vi.fn(),
      };

      attachDatabasePool(mysqlPool);

      expect(mysqlPool.on).toHaveBeenCalledWith(
        'release',
        expect.any(Function)
      );

      // Verify callback can be invoked without error
      const releaseCallback = mysqlPool.on.mock.calls[0][1];
      expect(() => releaseCallback()).not.toThrow();
      // Note: Debug logs are only shown when DEBUG env var is set at module load time
    });

    test('attaches release listener to MySQL2/MariaDB pool', () => {
      const mysql2Pool = {
        config: { idleTimeout: 20000 },
        on: vi.fn(),
      };

      attachDatabasePool(mysql2Pool);

      expect(mysql2Pool.on).toHaveBeenCalledWith(
        'release',
        expect.any(Function)
      );

      // Verify callback can be invoked without error
      const releaseCallback = mysql2Pool.on.mock.calls[0][1];
      expect(() => releaseCallback()).not.toThrow();
      // Note: Debug logs are only shown when DEBUG env var is set at module load time
    });

    test('attaches connectionCheckedOut listener to MongoDB pool', () => {
      const mongoPool = {
        options: { maxIdleTimeMS: 30000 },
        on: vi.fn(),
      };

      attachDatabasePool(mongoPool);

      expect(mongoPool.on).toHaveBeenCalledWith(
        'connectionCheckedOut',
        expect.any(Function)
      );

      // Verify callback can be invoked without error
      const checkedOutCallback = mongoPool.on.mock.calls[0][1];
      expect(() => checkedOutCallback()).not.toThrow();
      // Note: Debug logs are only shown when DEBUG env var is set at module load time
    });

    test('attaches end listener to Redis pool', () => {
      const redisPool = {
        options: { socket: {} },
        on: vi.fn(),
      };

      attachDatabasePool(redisPool);

      expect(redisPool.on).toHaveBeenCalledWith('end', expect.any(Function));

      // Verify callback can be invoked without error
      const endCallback = redisPool.on.mock.calls[0][1];
      expect(() => endCallback()).not.toThrow();
      // Note: Debug logs are only shown when DEBUG env var is set at module load time
    });

    test('clears existing timeout when attaching new pool', () => {
      const waitUntilMock = vi.fn();
      globalThis[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => ({ waitUntil: waitUntilMock }),
      };

      const pgPool1 = {
        options: { idleTimeoutMillis: 1000 },
        on: vi.fn(),
      };

      const pgPool2 = {
        options: { idleTimeoutMillis: 2000 },
        on: vi.fn(),
      };

      attachDatabasePool(pgPool1);
      const releaseCallback1 = pgPool1.on.mock.calls[0][1];
      releaseCallback1();

      const timerCount1 = vi.getTimerCount();

      attachDatabasePool(pgPool2);

      expect(vi.getTimerCount()).toBeLessThanOrEqual(timerCount1);
    });
  });

  describe('edge cases', () => {
    test('handles pools with missing optional properties', () => {
      const minimalPool = {
        on: vi.fn(),
      };

      expect(() => attachDatabasePool(minimalPool)).not.toThrow();
    });

    test('handles pools with undefined config properties', () => {
      const poolWithUndefinedConfig = {
        config: {
          connectionConfig: undefined,
        },
        on: vi.fn(),
      };

      expect(() => attachDatabasePool(poolWithUndefinedConfig)).not.toThrow();
    });

    test('handles pools with on method but no matching properties', () => {
      const poolWithOnOnly = {
        on: vi.fn(),
        someOtherProp: 'value',
      };

      attachDatabasePool(poolWithOnOnly);

      expect(poolWithOnOnly.on).not.toHaveBeenCalled();
    });
  });
});
