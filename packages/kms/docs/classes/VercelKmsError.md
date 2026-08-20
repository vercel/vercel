[**@vercel/kms**](../README.md)

---

# Class: VercelKmsError

Defined in: [packages/kms/src/errors.ts:7](https://github.com/vercel/vercel-internal/blob/main/packages/kms/src/errors.ts#L7)

Error thrown when a Vercel KMS request fails. Mirrors the API error envelope
`{ error: { code, message, ...meta } }`: `code` and `message` come from the
response body when present, and any remaining fields are exposed on
[VercelKmsError.metadata](#metadata).

## Extends

- [`Error`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Error)

## Constructors

### Constructor

> **new VercelKmsError**(`__namedParameters`): `VercelKmsError`

Defined in: [packages/kms/src/errors.ts:15](https://github.com/vercel/vercel-internal/blob/main/packages/kms/src/errors.ts#L15)

#### Parameters

##### \_\_namedParameters

###### code

`string`

###### message

`string`

###### metadata?

[`Record`](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type)\<`string`, `unknown`\> = `{}`

###### status

`number`

#### Returns

`VercelKmsError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` **code**: `string`

Defined in: [packages/kms/src/errors.ts:11](https://github.com/vercel/vercel-internal/blob/main/packages/kms/src/errors.ts#L11)

Machine-readable error code from the API (e.g. `issuer_not_found`).

---

### message

> **message**: `string`

Defined in: node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/lib.es5.d.ts:1077

#### Inherited from

`Error.message`

---

### metadata

> `readonly` **metadata**: [`Record`](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type)\<`string`, `unknown`\>

Defined in: [packages/kms/src/errors.ts:13](https://github.com/vercel/vercel-internal/blob/main/packages/kms/src/errors.ts#L13)

Any additional fields the API attached to the error envelope.

---

### name

> **name**: `string`

Defined in: node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/lib.es5.d.ts:1076

#### Inherited from

`Error.name`

---

### stack?

> `optional` **stack?**: `string`

Defined in: node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/lib.es5.d.ts:1078

#### Inherited from

`Error.stack`

---

### status

> `readonly` **status**: `number`

Defined in: [packages/kms/src/errors.ts:9](https://github.com/vercel/vercel-internal/blob/main/packages/kms/src/errors.ts#L9)

HTTP status code of the failed response.

---

### prepareStackTrace?

> `static` `optional` **prepareStackTrace?**: (`err`, `stackTraces`) => `any`

Defined in: node_modules/.pnpm/@types+node@20.11.0/node_modules/@types/node/globals.d.ts:28

Optional override for formatting stack traces

#### Parameters

##### err

[`Error`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Error)

##### stackTraces

`CallSite`[]

#### Returns

`any`

#### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

#### Inherited from

`Error.prepareStackTrace`

---

### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node_modules/.pnpm/@types+node@20.11.0/node_modules/@types/node/globals.d.ts:30

#### Inherited from

`Error.stackTraceLimit`

## Methods

### captureStackTrace()

> `static` **captureStackTrace**(`targetObject`, `constructorOpt?`): `void`

Defined in: node_modules/.pnpm/@types+node@20.11.0/node_modules/@types/node/globals.d.ts:21

Create .stack property on a target object

#### Parameters

##### targetObject

`object`

##### constructorOpt?

[`Function`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Function)

#### Returns

`void`

#### Inherited from

`Error.captureStackTrace`
