[**@vercel/aws**](../README.md)

---

# Function: createAuroraDSQL()

> **createAuroraDSQL**(`opts?`): `Pool`

Defined in: [packages/aws/src/aurora-dsql.ts:46](https://github.com/vercel/vercel/blob/main/packages/aws/src/aurora-dsql.ts#L46)

Creates a `pg` connection pool pre-configured for a Vercel Marketplace
Aurora DSQL cluster.

Each new connection authenticates with a short-lived IAM auth token minted
via Vercel OIDC + `sts:AssumeRoleWithWebIdentity`.

## Parameters

### opts?

[`CreateAuroraDSQLOptions`](../interfaces/CreateAuroraDSQLOptions.md) = `{}`

## Returns

`Pool`

## Example

```ts
import { createAuroraDSQL } from '@vercel/aws';

const sql = createAuroraDSQL();
const { rows } = await sql.query('SELECT now()');
```
