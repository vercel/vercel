import {
  boolean,
  datetime,
  index,
  int,
  json,
  mysqlTable,
  primaryKey,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

export const DEFAULT_DATETIME_VALUE = new Date(0);

export const cols = {
  table: mysqlTable,
  cuid: (name: string) => varchar(name, { length: 24 }),
  defaultVarchar: (name: string) => varchar(name, { length: 191 }),
  varchar,
  int,
  boolean,
  datetime,
  json,
  index,
  uniqueIndex,
  primaryKey,
};
