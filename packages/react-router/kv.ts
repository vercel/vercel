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

const genRanHex = (size: number) =>
  Array.from({ length: size }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');

export function createKvSessionStorage<Data = SessionData, FlashData = Data>({
  kv,
  cookie,
  prefix = 'session',
}: KvSessionStorageOptions) {
  type S = SessionIdStorageStrategy<Data, FlashData>;

  const createData: S['createData'] = async (data, expires) => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const baseId = genRanHex(16);
      const id = `${prefix}:${baseId}`;
      if ((await kv.exists(id)) === 0) {
        const str = JSON.stringify(data);
        if (expires) {
          await kv.set(id, str, { pxat: expires.getTime() });
        } else {
          await kv.set(id, str);
        }
        return id;
      }
    }
  };

  const readData: S['readData'] = async id => {
    return (await kv.get(id)) ?? null;
  };

  const updateData: S['updateData'] = async (id, data, expires) => {
    const str = JSON.stringify(data);
    if (str === '{}') {
      // If the data is empty then delete the session key
      return deleteData(id);
    }
    if (expires) {
      await kv.set(id, str, { pxat: expires.getTime() });
    } else {
      await kv.set(id, str);
    }
  };

  const deleteData: S['deleteData'] = async id => {
    await kv.del(id);
  };

  return createSessionStorage<Data, FlashData>({
    cookie,
    createData,
    readData,
    updateData,
    deleteData,
  });
}
