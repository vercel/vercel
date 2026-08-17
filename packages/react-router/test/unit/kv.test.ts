import { createCookie } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import { createKvSessionStorage } from '../../kv.js';

function createKv() {
  const values = new Map<string, string>();
  const get = vi.fn();
  return {
    values,
    get,
    client: {
      exists: vi.fn(async (key: string) => (values.has(key) ? 1 : 0)),
      del: vi.fn(async (key: string) => (values.delete(key) ? 1 : 0)),
      get: async <TData>(key: string): Promise<TData | null> => {
        get(key);
        const value = values.get(key);
        return value === undefined ? null : (JSON.parse(value) as TData);
      },
      set: vi.fn(async (key: string, value: string) => {
        values.set(key, value);
        return 'OK';
      }),
    },
  };
}

function cookieValue(setCookie: string) {
  return setCookie.split(';', 1)[0];
}

describe('createKvSessionStorage', () => {
  test('preserves the session lifecycle for adapter-generated ids', async () => {
    const kv = createKv();
    const storage = createKvSessionStorage({
      kv: kv.client,
      cookie: { name: '__session' },
    });

    const session = await storage.getSession();
    session.set('user', 'first');
    const cookie = cookieValue(await storage.commitSession(session));
    const id = await createCookie('__session').parse(cookie);

    expect(id).toMatch(/^session:[0-9a-f-]{36}$/);
    expect(kv.values.get(id)).toBe(JSON.stringify({ user: 'first' }));

    const restored = await storage.getSession(cookie);
    expect(restored.get('user')).toBe('first');
    restored.set('user', 'updated');
    await storage.commitSession(restored);
    expect(kv.values.get(id)).toBe(JSON.stringify({ user: 'updated' }));

    await storage.destroySession(restored);
    expect(kv.values.has(id)).toBe(false);
  });

  test('does not access unrelated keys referenced by an unsigned cookie', async () => {
    const kv = createKv();
    const unrelatedKey = 'application:private-data';
    kv.values.set(unrelatedKey, JSON.stringify({ private: true }));
    const cookie = createCookie('__session');
    const forgedCookie = cookieValue(await cookie.serialize(unrelatedKey));
    const storage = createKvSessionStorage({ kv: kv.client, cookie });

    const session = await storage.getSession(forgedCookie);
    expect(session.data).toEqual({});
    expect(kv.get).not.toHaveBeenCalled();

    session.set('private', false);
    await storage.commitSession(session);
    expect(kv.client.set).not.toHaveBeenCalled();
    expect(kv.values.get(unrelatedKey)).toBe(JSON.stringify({ private: true }));

    await storage.destroySession(session);
    expect(kv.client.del).not.toHaveBeenCalled();
    expect(kv.values.get(unrelatedKey)).toBe(JSON.stringify({ private: true }));
  });

  test('rejects uppercase ids that the adapter cannot generate', async () => {
    const kv = createKv();
    const unrelatedKey = 'SESSION:550E8400-E29B-41D4-A716-446655440000';
    kv.values.set(unrelatedKey, JSON.stringify({ private: true }));
    const cookie = createCookie('__session');
    const forgedCookie = cookieValue(await cookie.serialize(unrelatedKey));
    const storage = createKvSessionStorage({ kv: kv.client, cookie });

    const session = await storage.getSession(forgedCookie);
    session.set('private', false);
    await storage.commitSession(session);
    await storage.destroySession(session);

    expect(kv.get).not.toHaveBeenCalled();
    expect(kv.client.set).not.toHaveBeenCalled();
    expect(kv.client.del).not.toHaveBeenCalled();
    expect(kv.values.get(unrelatedKey)).toBe(JSON.stringify({ private: true }));
  });

  test('rejects ids outside the configured session namespace', async () => {
    const kv = createKv();
    const unrelatedKey = 'session:550e8400-e29b-41d4-a716-446655440000';
    kv.values.set(unrelatedKey, JSON.stringify({ private: true }));
    const cookie = createCookie('__session');
    const forgedCookie = cookieValue(await cookie.serialize(unrelatedKey));
    const storage = createKvSessionStorage({
      kv: kv.client,
      cookie,
      prefix: 'custom',
    });

    const session = await storage.getSession(forgedCookie);
    session.set('private', false);
    await storage.commitSession(session);
    await storage.destroySession(session);

    expect(kv.get).not.toHaveBeenCalled();
    expect(kv.client.set).not.toHaveBeenCalled();
    expect(kv.client.del).not.toHaveBeenCalled();
    expect(kv.values.get(unrelatedKey)).toBe(JSON.stringify({ private: true }));
  });
});
