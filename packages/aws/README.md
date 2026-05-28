# @vercel/aws

Pre-configured AWS service clients for [Vercel Marketplace](https://vercel.com/marketplace) resources.

Credentials are resolved automatically via [Vercel OIDC](https://vercel.com/docs/security/secure-backend-access/oidc) — no static access keys required. Configuration is read from the env vars Vercel injects under each linked resource's prefix; in the common case where one resource of a given service is connected, the factory autodetects the prefix and you call it with no arguments.

## Install

```sh
pnpm add @vercel/aws
```

Then install the AWS SDK(s) for the services you use:

```sh
pnpm add @opensearch-project/opensearch                  # OpenSearch
pnpm add @aws-sdk/dsql-signer pg                         # Aurora DSQL
pnpm add @aws-sdk/rds-signer pg                          # Aurora PostgreSQL
pnpm add @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb  # DynamoDB
```

## How resolution works

When you link a Marketplace resource to a project, Vercel asks you to choose an env var prefix (defaults to `STORAGE`, then `STORAGE2`, etc.). Every value the integration injects is namespaced under that prefix — for example `STORAGE_PGHOST`, `STORAGE_AWS_REGION`, `STORAGE_AWS_ROLE_ARN`.

Each factory in this package finds its resource by scanning env for a `*_AWS_RESOURCE_ARN` whose value starts with the relevant AWS service segment (`arn:aws:aoss:`, `arn:aws:dsql:`, `arn:aws:rds:`, `arn:aws:dynamodb:`). When exactly one match exists, the prefix is determined automatically. If you have multiple resources of the same service connected, pass `{ prefix }` to pick which one. You can also pass explicit fields (`hostname`, `region`, `roleArn`, etc.) to bypass env lookup entirely — useful for local development.

## OpenSearch

```ts
import { createOpenSearch } from '@vercel/aws';

const os = createOpenSearch();

const results = await os.search({
  index: 'docs',
  body: { query: { match: { title: 'vercel' } } },
});
```

## Aurora DSQL

Returns a [`pg`](https://node-postgres.com) connection pool. Each new connection authenticates with a short-lived IAM auth token minted via OIDC.

```ts
import { createAuroraDSQL } from '@vercel/aws';

const sql = createAuroraDSQL();

const { rows } = await sql.query('SELECT * FROM users WHERE id = $1', [id]);
```

The pool defaults to user `admin` and database `postgres`. Override either, or any other `pg` `PoolConfig` field, by passing it through:

```ts
const sql = createAuroraDSQL({ user: 'reader', max: 5 });
```

## Aurora PostgreSQL

Same shape as Aurora DSQL — returns a `pg.Pool` that authenticates each new connection with an IAM auth token. The cluster must have IAM database authentication enabled.

```ts
import { createAuroraPostgreSQL } from '@vercel/aws';

const sql = createAuroraPostgreSQL();

const { rows } = await sql.query('SELECT now()');
```

## DynamoDB

`createDynamoDB()` returns the low-level `DynamoDBClient`:

```ts
import { createDynamoDB } from '@vercel/aws';
import { GetItemCommand } from '@aws-sdk/client-dynamodb';

const ddb = createDynamoDB();
const result = await ddb.send(
  new GetItemCommand({ TableName: 'users', Key: { id: { S: '1' } } })
);
```

`createDynamoDBDocument()` returns a `DynamoDBDocumentClient` that auto-marshals plain JS objects to/from DynamoDB attribute values — usually what you want in application code:

```ts
import { createDynamoDBDocument } from '@vercel/aws';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

const ddb = createDynamoDBDocument();
const result = await ddb.send(
  new GetCommand({ TableName: 'users', Key: { id: '1' } })
);
```

## Multiple resources of the same service

When two or more resources of the same service are connected (e.g. two Aurora DSQL clusters), autodetect throws with the prefixes it found. Pass one:

```ts
const usersDb = createAuroraDSQL({ prefix: 'STORAGE2' });
const analyticsDb = createAuroraDSQL({ prefix: 'STORAGE4' });
```
