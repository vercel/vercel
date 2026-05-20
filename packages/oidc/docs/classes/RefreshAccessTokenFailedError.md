[**@vercel/oidc**](../README.md)

---

# Class: RefreshAccessTokenFailedError

Defined in: [packages/oidc/src/auth-errors.ts:18](https://github.com/vercel/vercel/blob/main/packages/oidc/src/auth-errors.ts#L18)

Error thrown when attempting to refresh the authentication token fails.
This includes cases where no refresh token is available.

## Extends

- [`Error`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Error)

## Constructors

### Constructor

> **new RefreshAccessTokenFailedError**(`cause?`): `RefreshAccessTokenFailedError`

Defined in: [packages/oidc/src/auth-errors.ts:20](https://github.com/vercel/vercel/blob/main/packages/oidc/src/auth-errors.ts#L20)

#### Parameters

##### cause?

`unknown`

#### Returns

`RefreshAccessTokenFailedError`

#### Overrides

`Error.constructor`

## Properties

### message

> **message**: `string`

Defined in: node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/lib.es5.d.ts:1077

#### Inherited from

`Error.message`

---

### name

> **name**: `string` = `'RefreshAccessTokenFailedError'`

Defined in: [packages/oidc/src/auth-errors.ts:19](https://github.com/vercel/vercel/blob/main/packages/oidc/src/auth-errors.ts#L19)

#### Overrides

`Error.name`

---

### stack?

> `optional` **stack?**: `string`

Defined in: node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/lib.es5.d.ts:1078

#### Inherited from

`Error.stack`

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
