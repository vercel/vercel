[**@vercel/aws**](../README.md)

---

# Interface: CreateAuroraDSQLOptions

Defined in: [packages/aws/src/aurora-dsql.ts:17](https://github.com/vercel/vercel/blob/main/packages/aws/src/aurora-dsql.ts#L17)

Options for [createAuroraDSQL](../functions/createAuroraDSQL.md).

All fields are optional. With no arguments, the factory finds the connected
Aurora DSQL resource by scanning env for a `_AWS_RESOURCE_ARN` starting
with `arn:aws:dsql:`, then reads every other field from env vars under
that prefix.

Any field on `pg`'s `PoolConfig` may also be passed and is forwarded to
the `Pool`.

## Extends

- [`Partial`](https://www.typescriptlang.org/docs/handbook/utility-types.html#partialtype)\<`PoolConfig`\>

## Properties

### allowExitOnIdle?

> `optional` **allowExitOnIdle?**: `boolean`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:53

#### Inherited from

`Partial.allowExitOnIdle`

---

### application_name?

> `optional` **application_name?**: `string`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:27

#### Inherited from

`Partial.application_name`

---

### Client?

> `optional` **Client?**: () => `ClientBase`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:56

#### Returns

`ClientBase`

#### Inherited from

`Partial.Client`

---

### client_encoding?

> `optional` **client_encoding?**: `string`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:32

#### Inherited from

`Partial.client_encoding`

---

### connectionString?

> `optional` **connectionString?**: `string`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:18

#### Inherited from

`Partial.connectionString`

---

### connectionTimeoutMillis?

> `optional` **connectionTimeoutMillis?**: `number`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:29

#### Inherited from

`Partial.connectionTimeoutMillis`

---

### database?

> `optional` **database?**: `string`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:14

#### Inherited from

`Partial.database`

---

### fallback_application_name?

> `optional` **fallback_application_name?**: `string`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:28

#### Inherited from

`Partial.fallback_application_name`

---

### host?

> `optional` **host?**: `string`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:17

#### Inherited from

`Partial.host`

---

### hostname?

> `optional` **hostname?**: `string`

Defined in: [packages/aws/src/aurora-dsql.ts:24](https://github.com/vercel/vercel/blob/main/packages/aws/src/aurora-dsql.ts#L24)

Overrides `<prefix>_PGHOST`.

---

### idle_in_transaction_session_timeout?

> `optional` **idle_in_transaction_session_timeout?**: `number`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:26

#### Inherited from

`Partial.idle_in_transaction_session_timeout`

---

### idleTimeoutMillis?

> `optional` **idleTimeoutMillis?**: `number` \| `null`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:50

#### Inherited from

`Partial.idleTimeoutMillis`

---

### keepAlive?

> `optional` **keepAlive?**: `boolean`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:19

#### Inherited from

`Partial.keepAlive`

---

### keepAliveInitialDelayMillis?

> `optional` **keepAliveInitialDelayMillis?**: `number`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:25

#### Inherited from

`Partial.keepAliveInitialDelayMillis`

---

### lock_timeout?

> `optional` **lock_timeout?**: `number`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:24

#### Inherited from

`Partial.lock_timeout`

---

### log?

> `optional` **log?**: (...`messages`) => `void`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:51

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

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:48

#### Inherited from

`Partial.max`

---

### maxLifetimeSeconds?

> `optional` **maxLifetimeSeconds?**: `number`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:55

#### Inherited from

`Partial.maxLifetimeSeconds`

---

### maxUses?

> `optional` **maxUses?**: `number`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:54

#### Inherited from

`Partial.maxUses`

---

### min?

> `optional` **min?**: `number`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:49

#### Inherited from

`Partial.min`

---

### options?

> `optional` **options?**: `string`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:31

#### Inherited from

`Partial.options`

---

### password?

> `optional` **password?**: `string` \| (() => `string` \| [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`string`\>)

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:15

#### Inherited from

`Partial.password`

---

### port?

> `optional` **port?**: `number`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:16

#### Inherited from

`Partial.port`

---

### prefix?

> `optional` **prefix?**: `string`

Defined in: [packages/aws/src/aurora-dsql.ts:22](https://github.com/vercel/vercel/blob/main/packages/aws/src/aurora-dsql.ts#L22)

The env var prefix the Marketplace integration was linked under
(e.g. `STORAGE2`). Defaults to autodetect via the resource ARN.

---

### Promise?

> `optional` **Promise?**: `PromiseConstructorLike`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:52

#### Inherited from

`Partial.Promise`

---

### query_timeout?

> `optional` **query_timeout?**: `number`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:23

#### Inherited from

`Partial.query_timeout`

---

### region?

> `optional` **region?**: `string`

Defined in: [packages/aws/src/aurora-dsql.ts:26](https://github.com/vercel/vercel/blob/main/packages/aws/src/aurora-dsql.ts#L26)

Overrides `<prefix>_AWS_REGION`.

---

### roleArn?

> `optional` **roleArn?**: `string`

Defined in: [packages/aws/src/aurora-dsql.ts:28](https://github.com/vercel/vercel/blob/main/packages/aws/src/aurora-dsql.ts#L28)

Overrides `<prefix>_AWS_ROLE_ARN`.

---

### ssl?

> `optional` **ssl?**: `boolean` \| `ConnectionOptions`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:22

#### Inherited from

`Partial.ssl`

---

### statement_timeout?

> `optional` **statement_timeout?**: `number` \| `false`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:21

#### Inherited from

`Partial.statement_timeout`

---

### stream?

> `optional` **stream?**: () => `Duplex` \| `undefined`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:20

#### Returns

`Duplex` \| `undefined`

#### Inherited from

`Partial.stream`

---

### types?

> `optional` **types?**: `CustomTypesConfig`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:30

#### Inherited from

`Partial.types`

---

### user?

> `optional` **user?**: `string`

Defined in: node_modules/.pnpm/@types+pg@8.15.5/node_modules/@types/pg/index.d.ts:13

#### Inherited from

`Partial.user`
