[**@vercel/aws**](../README.md)

---

# Interface: CreateAuroraDSQLOptions

Defined in: packages/aws/src/aurora-dsql.ts:19

Options for [createAuroraDSQL](../functions/createAuroraDSQL.md).

All fields are optional. With no arguments, the factory finds the connected
Aurora DSQL cluster by its `<prefix>_PGHOST` env var (a
`*.dsql.<region>.on.aws` hostname), then reads every other field from env
vars under that prefix. An explicit `prefix` pointing at an Aurora
PostgreSQL cluster throws.

Any field on `pg`'s `PoolConfig` may also be passed and is forwarded to
the `Pool`.

## Extends

- [`Partial`](https://www.typescriptlang.org/docs/handbook/utility-types.html#partialtype)\<`PoolConfig`\>

## Properties

### allowExitOnIdle?

> `optional` **allowExitOnIdle?**: `boolean`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:56

#### Inherited from

`Partial.allowExitOnIdle`

---

### application_name?

> `optional` **application_name?**: `string`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:29

#### Inherited from

`Partial.application_name`

---

### Client?

> `optional` **Client?**: () => `ClientBase`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:59

#### Returns

`ClientBase`

#### Inherited from

`Partial.Client`

---

### client_encoding?

> `optional` **client_encoding?**: `string`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:34

#### Inherited from

`Partial.client_encoding`

---

### connectionString?

> `optional` **connectionString?**: `string`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:18

#### Inherited from

`Partial.connectionString`

---

### connectionTimeoutMillis?

> `optional` **connectionTimeoutMillis?**: `number`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:31

#### Inherited from

`Partial.connectionTimeoutMillis`

---

### database?

> `optional` **database?**: `string`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:14

#### Inherited from

`Partial.database`

---

### enableChannelBinding?

> `optional` **enableChannelBinding?**: `boolean`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:23

#### Inherited from

`Partial.enableChannelBinding`

---

### fallback_application_name?

> `optional` **fallback_application_name?**: `string`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:30

#### Inherited from

`Partial.fallback_application_name`

---

### host?

> `optional` **host?**: `string`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:17

#### Inherited from

`Partial.host`

---

### hostname?

> `optional` **hostname?**: `string`

Defined in: packages/aws/src/aurora-dsql.ts:27

Overrides `<prefix>_PGHOST`.

---

### idle_in_transaction_session_timeout?

> `optional` **idle_in_transaction_session_timeout?**: `number`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:28

#### Inherited from

`Partial.idle_in_transaction_session_timeout`

---

### idleTimeoutMillis?

> `optional` **idleTimeoutMillis?**: `number` \| `null`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:53

#### Inherited from

`Partial.idleTimeoutMillis`

---

### keepAlive?

> `optional` **keepAlive?**: `boolean`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:19

#### Inherited from

`Partial.keepAlive`

---

### keepAliveInitialDelayMillis?

> `optional` **keepAliveInitialDelayMillis?**: `number`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:27

#### Inherited from

`Partial.keepAliveInitialDelayMillis`

---

### lock_timeout?

> `optional` **lock_timeout?**: `number`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:26

#### Inherited from

`Partial.lock_timeout`

---

### log?

> `optional` **log?**: (...`messages`) => `void`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:54

#### Parameters

##### messages

...`any`[]

#### Returns

`void`

#### Inherited from

`Partial.log`

---

### max?

> `optional` **max?**: `number`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:51

#### Inherited from

`Partial.max`

---

### maxLifetimeSeconds?

> `optional` **maxLifetimeSeconds?**: `number`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:58

#### Inherited from

`Partial.maxLifetimeSeconds`

---

### maxUses?

> `optional` **maxUses?**: `number`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:57

#### Inherited from

`Partial.maxUses`

---

### min?

> `optional` **min?**: `number`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:52

#### Inherited from

`Partial.min`

---

### onConnect?

> `optional` **onConnect?**: (`client`) => `void`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:60

#### Parameters

##### client

`ClientBase`

#### Returns

`void`

#### Inherited from

`Partial.onConnect`

---

### options?

> `optional` **options?**: `string`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:33

#### Inherited from

`Partial.options`

---

### password?

> `optional` **password?**: `string` \| (() => `string` \| [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`string`\>)

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:15

#### Inherited from

`Partial.password`

---

### pipeline?

> `optional` **pipeline?**: `boolean`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:35

#### Inherited from

`Partial.pipeline`

---

### port?

> `optional` **port?**: `number`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:16

#### Inherited from

`Partial.port`

---

### prefix?

> `optional` **prefix?**: `string`

Defined in: packages/aws/src/aurora-dsql.ts:25

The env var prefix the Marketplace integration was linked under
(e.g. `STORAGE2`). Defaults to autodetect — only required when multiple
Aurora DSQL clusters are connected.

---

### Promise?

> `optional` **Promise?**: `PromiseConstructorLike`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:55

#### Inherited from

`Partial.Promise`

---

### query_timeout?

> `optional` **query_timeout?**: `number`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:25

#### Inherited from

`Partial.query_timeout`

---

### region?

> `optional` **region?**: `string`

Defined in: packages/aws/src/aurora-dsql.ts:29

Overrides `<prefix>_AWS_REGION`.

---

### roleArn?

> `optional` **roleArn?**: `string`

Defined in: packages/aws/src/aurora-dsql.ts:31

Overrides `<prefix>_AWS_ROLE_ARN`.

---

### ssl?

> `optional` **ssl?**: `boolean` \| `ConnectionOptions`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:22

#### Inherited from

`Partial.ssl`

---

### sslnegotiation?

> `optional` **sslnegotiation?**: `"postgres"` \| `"direct"`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:24

#### Inherited from

`Partial.sslnegotiation`

---

### statement_timeout?

> `optional` **statement_timeout?**: `number` \| `false`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:21

#### Inherited from

`Partial.statement_timeout`

---

### stream?

> `optional` **stream?**: () => `Duplex` \| `undefined`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:20

#### Returns

`Duplex` \| `undefined`

#### Inherited from

`Partial.stream`

---

### types?

> `optional` **types?**: `CustomTypesConfig`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:32

#### Inherited from

`Partial.types`

---

### user?

> `optional` **user?**: `string`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:13

#### Inherited from

`Partial.user`

---

### verify?

> `optional` **verify?**: (`client`, `done`) => `void`

Defined in: node_modules/.pnpm/@types+pg@8.23.1/node_modules/@types/pg/index.d.ts:61

#### Parameters

##### client

`PoolClient`

##### done

(`err?`) => `void`

#### Returns

`void`

#### Inherited from

`Partial.verify`
