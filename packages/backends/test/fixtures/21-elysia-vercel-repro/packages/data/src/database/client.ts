import { fetch } from '@adobe/fetch';
import { Client, type Connection } from '@planetscale/database';
import env from '../env';

export type DatabaseClient = Connection;

const databaseFetch = ((input: unknown, init: unknown) =>
  (fetch as unknown as (i: unknown, n: unknown) => Promise<unknown>)(
    input,
    init,
  )) as never;

export const createDatabaseClient = (): DatabaseClient => {
  const client = new Client({
    host: env.DATABASE_HOST,
    username: env.DATABASE_USERNAME,
    password: env.DATABASE_PASSWORD,
    fetch: databaseFetch,
  });
  return client.connection();
};
