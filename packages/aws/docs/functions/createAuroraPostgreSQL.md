[**@vercel/aws**](../README.md)

---

# Function: createAuroraPostgreSQL()

> **createAuroraPostgreSQL**(`opts?`): `Pool`

Defined in: [packages/aws/src/aurora-postgresql.ts:47](https://github.com/vercel/vercel/blob/main/packages/aws/src/aurora-postgresql.ts#L47)

Creates a `pg` connection pool pre-configured for a Vercel Marketplace
Aurora PostgreSQL cluster.

Each new connection authenticates with a short-lived IAM auth token minted
via Vercel OIDC + `sts:AssumeRoleWithWebIdentity`. The cluster must have
IAM database authentication enabled.

## Parameters

### opts?

[`CreateAuroraPostgreSQLOptions`](../interfaces/CreateAuroraPostgreSQLOptions.md) = `{}`

## Returns

`Pool`

## Example

```ts
import { createAuroraPostgreSQL } from '@vercel/aws';

const sql = createAuroraPostgreSQL();
const { rows } = await sql.query('SELECT * FROM users WHERE id = $1', [id]);
```
