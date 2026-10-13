[**@vercel/aws**](../README.md)

---

# Function: createAuroraDSQL()

> **createAuroraDSQL**(`opts?`): `Pool`

Defined in: packages/aws/src/aurora-dsql.ts:49

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
