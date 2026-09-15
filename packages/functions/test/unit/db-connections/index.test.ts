import { expect, test, vi, describe, beforeEach, afterEach } from 'vitest';
import { SYMBOL_FOR_REQ_CONTEXT } from '../../../src/get-context';

describe('db-connections', () => {
  let attachDatabasePool: typeof import('../../../src/db-connections').attachDatabasePool;

  beforeEach(async () => {
    vi.stubEnv('VERCEL_URL', 'test.vercel.app');
    vi.stubEnv('VERCEL_REGION', 'iad1');
    vi.stubEnv('DEBUG', '1');
    vi.resetModules();
    ({ attachDatabasePool } = await import('../../../src/db-connections'));
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    delete globalThis[SYMBOL_FOR_REQ_CONTEXT];
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
      expect(console.log).toHaveBeenCalledWith('Client released from pool');
    });

    test('warns when pool release triggered outside request scope', () => {
      const pgPool = {
        options: { idleTimeoutMillis: 1000 },
        on: vi.fn(),
      };

      attachDatabasePool(pgPool);

      const releaseCallback = pgPool.on.mock.calls[0][1];
      releaseCallback();

      expect(console.warn).toHaveBeenCalledWith(
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

    test('uses the invocation deadline to limit the wait time', () => {
      const waitUntilMock = vi.fn();
      const now = Date.now();
      globalThis[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => ({
          deadline: new Date(now + 5000).toISOString(),
          waitUntil: waitUntilMock,
        }),
      };

      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

      const pgPool = {
        options: { idleTimeoutMillis: 10 * 60 * 1000 },
        on: vi.fn(),
      };

      attachDatabasePool(pgPool);

      const releaseCallback = pgPool.on.mock.calls[0][1];
      releaseCallback();

      expect(setTimeoutSpy).toHaveBeenLastCalledWith(
        expect.any(Function),
        4000
      );
    });

    test('uses the pool idle timeout on a long-lived process', () => {
      const waitUntilMock = vi.fn();
      const processAge = 20 * 60 * 1000;
      vi.setSystemTime(Date.now() + processAge);
      const now = Date.now();

      globalThis[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => ({
          deadline: new Date(now + 15 * 60 * 1000).toISOString(),
          waitUntil: waitUntilMock,
        }),
      };

      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

      const pgPool = {
        options: { idleTimeoutMillis: 5000 },
        on: vi.fn(),
      };

      attachDatabasePool(pgPool);

      const releaseCallback = pgPool.on.mock.calls[0][1];
      releaseCallback();

      expect(setTimeoutSpy).toHaveBeenLastCalledWith(
        expect.any(Function),
        5100
      );
    });

    test('ensures a minimum wait time of 100ms after the deadline', () => {
      const waitUntilMock = vi.fn();
      globalThis[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => ({
          deadline: new Date(Date.now() - 1000).toISOString(),
          waitUntil: waitUntilMock,
        }),
      };

      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      const pgPool = {
        options: { idleTimeoutMillis: 5000 },
        on: vi.fn(),
      };

      attachDatabasePool(pgPool);
      const releaseCallback = pgPool.on.mock.calls[0][1];
      releaseCallback();

      expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 100);
    });

    test('falls back to the maximum duration without a deadline', () => {
      const waitUntilMock = vi.fn();
      globalThis[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => ({ waitUntil: waitUntilMock }),
      };

      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      const pgPool = {
        options: { idleTimeoutMillis: 20 * 60 * 1000 },
        on: vi.fn(),
      };

      attachDatabasePool(pgPool);
      const releaseCallback = pgPool.on.mock.calls[0][1];
      releaseCallback();

      expect(setTimeoutSpy).toHaveBeenLastCalledWith(
        expect.any(Function),
        15 * 60 * 1000 - 1000
      );
    });

    test('timeout expires and logs message', async () => {
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

      expect(console.log).toHaveBeenCalledWith(
        'Database pool idle timeout reached. Releasing connections.'
      );
    });

    test('keeps debug logs disabled when DEBUG is unset', async () => {
      vi.stubEnv('DEBUG', undefined);
      vi.resetModules();
      ({ attachDatabasePool } = await import('../../../src/db-connections'));
      const waitUntilMock = vi.fn();
      globalThis[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => ({ waitUntil: waitUntilMock }),
      };
      const pgPool = {
        options: { idleTimeoutMillis: 100 },
        on: vi.fn(),
      };

      attachDatabasePool(pgPool);
      pgPool.on.mock.calls[0][1]();
      vi.advanceTimersByTime(200);

      expect(waitUntilMock).toHaveBeenCalledWith(expect.any(Promise));
      expect(console.log).not.toHaveBeenCalled();
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

      const releaseCallback = mysqlPool.on.mock.calls[0][1];
      releaseCallback();
      expect(console.log).toHaveBeenCalledWith(
        'MySQL client released from pool'
      );
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

      const releaseCallback = mysql2Pool.on.mock.calls[0][1];
      releaseCallback();
      expect(console.log).toHaveBeenCalledWith(
        'MySQL2/MariaDB client released from pool'
      );
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

      const checkedOutCallback = mongoPool.on.mock.calls[0][1];
      checkedOutCallback();
      expect(console.log).toHaveBeenCalledWith(
        'MongoDB connection checked out'
      );
    });

    test('attaches end listener to Redis pool', () => {
      const redisPool = {
        options: { socket: {} },
        on: vi.fn(),
      };

      attachDatabasePool(redisPool);

      expect(redisPool.on).toHaveBeenCalledWith('end', expect.any(Function));

      const endCallback = redisPool.on.mock.calls[0][1];
      endCallback();
      expect(console.log).toHaveBeenCalledWith('Redis connection ended');
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
    test('rejects pools without identifying properties', () => {
      const minimalPool = {
        on: vi.fn(),
      };

      expect(() => attachDatabasePool(minimalPool)).toThrow(
        'Unsupported database pool type'
      );
      expect(minimalPool.on).not.toHaveBeenCalled();
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

    test('rejects pools with on method but no matching properties', () => {
      const poolWithOnOnly = {
        on: vi.fn(),
        someOtherProp: 'value',
      };

      expect(() => attachDatabasePool(poolWithOnOnly)).toThrow(
        'Unsupported database pool type'
      );

      expect(poolWithOnOnly.on).not.toHaveBeenCalled();
    });
  });
});
