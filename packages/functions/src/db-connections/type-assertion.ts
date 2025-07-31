// This file only exists to ensure that the duck typing is compatible with the actual types.
// It is not used in the codebase.

import type { Pool as PgPoolType } from 'pg';
import type { Pool as MySQL2PoolType } from 'mysql2/promise';
import type { Pool as MariaDBPoolType } from 'mariadb';
import type { MongoClient as MongoDBClientType } from 'mongodb';
import type { Redis as IoRedisType } from 'ioredis';
import type { Client as CassandraClientType } from 'cassandra-driver';
import type { DbPool } from '.';

// Note: Our interfaces are simplified versions that only include the properties
// needed for lifecycle observation. They are compatible subsets of the actual types.

// Type assertions to verify our interfaces are proper subtypes of the imported types
// This ensures that real database instances can be used where our interfaces are expected
export const pgSubtypeCheck = (pool: PgPoolType): DbPool => pool;
export const mysql2SubtypeCheck = (pool: MySQL2PoolType): DbPool => pool;
export const mariadbSubtypeCheck = (pool: MariaDBPoolType): DbPool => pool;
export const mongoSubtypeCheck = (client: MongoDBClientType): DbPool => client;
export const ioredisSubtypeCheck = (redis: IoRedisType): DbPool => redis;
export const cassandraSubtypeCheck = (client: CassandraClientType): DbPool =>
  client;

throw new Error('This file is not used in the codebase.');
