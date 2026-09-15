import {
  createSessionStorage,
  type SessionData,
  type SessionIdStorageStrategy,
} from 'react-router';

/**
 * KV client from the `@vercel/kv` package.
 */
interface KvClient {
  exists: (key: string) => Promise<number>;
  del: (key: string) => Promise<number>;
  get: <TData>(key: string) => Promise<TData | null>;
  set: (
    key: string,
    value: string,
    opts?: { pxat?: any; nx?: any }
  ) => Promise<string | null>;
}

export interface KvSessionStorageOptions {
  /**
   * KV client from the `@vercel/kv` package.
   */
  kv: KvClient;

  /**
   * The Cookie used to store the session id on the client, or options used
   * to automatically create one.
   */
  cookie: SessionIdStorageStrategy['cookie'];

  /**
   * Prefix of the Redis key name used for session data, followed by `:${id}`.
   * @default "session".
   */
  prefix?: string;
}

export function createKvSessionStorage<Data = SessionData, FlashData = Data>({
  kv,
  cookie,
  prefix = 'session',
}: KvSessionStorageOptions) {
  type S = SessionIdStorageStrategy<Data, FlashData>;

  const sessionIdPattern = new RegExp(
    `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:` +
      '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  );
  const isSessionId = (id: string) => sessionIdPattern.test(id);

  async function setData(id: string, value: string, expires?: Date) {
    if (expires) {
      await kv.set(id, value, { pxat: expires.getTime() });
    } else {
      await kv.set(id, value);
    }
  }

  const createData: S['createData'] = async (data, expires) => {
    while (true) {
      const id = `${prefix}:${(globalThis as any).crypto.randomUUID()}`;
      // `exists` returns the number of keys that match the
      // given pattern, so if it's 0 then the key doesn't exist.
      if ((await kv.exists(id)) === 0) {
        const str = JSON.stringify(data);
        await setData(id, str, expires);
        return id;
      }
    }
  };

  const readData: S['readData'] = async id => {
    if (!isSessionId(id)) {
      return null;
    }
    return (await kv.get(id)) ?? null;
  };

  const updateData: S['updateData'] = async (id, data, expires) => {
    if (!isSessionId(id)) {
      return;
    }
    const str = JSON.stringify(data);
    if (str === '{}') {
      // If the data is empty then delete the session key
      return deleteData(id);
    }
    await setData(id, str, expires);
  };

  const deleteData: S['deleteData'] = async id => {
    if (isSessionId(id)) {
      await kv.del(id);
    }
  };

  return createSessionStorage<Data, FlashData>({
    cookie,
    createData,
    readData,
    updateData,
    deleteData,
  });
}
