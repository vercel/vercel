[**@vercel/functions**](../../README.md)

---

# ~~Variable: experimental_attachDatabasePool()~~

> `const` **experimental_attachDatabasePool**: (`dbPool`) => `void` = `attachDatabasePool`

Defined in: [packages/functions/src/db-connections/index.ts:323](https://github.com/vercel/vercel/blob/main/packages/functions/src/db-connections/index.ts#L323)

**`Experimental`**

Call this function right after creating a database pool with the database pool object
as argument.
This ensures that the current function instance stays alive long enough for
idle database connections to be removed from the pool.

## Parameters

### dbPool

`DbPool`

The database pool object. The supported pool types are:

- PostgreSQL (pg)
- MySQL2
- MariaDB
- MongoDB
- Redis (ioredis)
- Cassandra (cassandra-driver)
- OTHER: This method uses duck-typing to detect the pool type. Respectively you can
  pass in any object with a compatible interface.

## Returns

`void`

## Example

```ts
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
attachDatabasePool(pgPool);
```

## Deprecated

Use attachDatabasePool instead.
