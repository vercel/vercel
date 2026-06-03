import { fetch } from '@adobe/fetch';
import { Client } from '@planetscale/database';
import {
  drizzle,
  type PlanetScaleDatabase,
} from 'drizzle-orm/planetscale-serverless';
import env from '../env';

export type DrizzleDatabase = PlanetScaleDatabase;

export type DrizzleDatabaseTransaction = Parameters<
  Parameters<DrizzleDatabase['transaction']>[0]
>[0];

const databaseFetch = ((input: unknown, init: unknown) =>
  (fetch as unknown as (i: unknown, n: unknown) => Promise<unknown>)(
    input,
    init,
  )) as never;

export const createDrizzleClient = (): DrizzleDatabase => {
  const connection = new Client({
    host: env.DATABASE_HOST,
    username: env.DATABASE_USERNAME,
    password: env.DATABASE_PASSWORD,
    fetch: databaseFetch,
  });
  return drizzle(connection) as DrizzleDatabase;
};
