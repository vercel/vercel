# Class: TokenExpiredError

Error thrown when the authentication token is expired
and no refresh token is available to obtain a new one.

## Hierarchy

- [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error)

  ↳ **`TokenExpiredError`**

## Table of contents

### Constructors

- [constructor](TokenExpiredError.md#constructor)

### Properties

- [message](TokenExpiredError.md#message)
- [name](TokenExpiredError.md#name)
- [stack](TokenExpiredError.md#stack)
- [prepareStackTrace](TokenExpiredError.md#preparestacktrace)
- [stackTraceLimit](TokenExpiredError.md#stacktracelimit)

### Methods

- [captureStackTrace](TokenExpiredError.md#capturestacktrace)

## Constructors

### constructor

• **new TokenExpiredError**()

#### Overrides

Error.constructor

#### Defined in

[packages/oidc/src/auth-errors.ts:18](https://github.com/vercel/vercel/blob/main/packages/oidc/src/auth-errors.ts#L18)

## Properties

### message

• **message**: `string`

#### Inherited from

Error.message

#### Defined in

node_modules/.pnpm/typescript@4.9.5/node_modules/typescript/lib/lib.es5.d.ts:1054

---

### name

• **name**: `string` = `'TokenExpiredError'`

#### Overrides

Error.name

#### Defined in

[packages/oidc/src/auth-errors.ts:17](https://github.com/vercel/vercel/blob/main/packages/oidc/src/auth-errors.ts#L17)

---

### stack

• `Optional` **stack**: `string`

#### Inherited from

Error.stack

#### Defined in

node_modules/.pnpm/typescript@4.9.5/node_modules/typescript/lib/lib.es5.d.ts:1055

---

### prepareStackTrace

▪ `Static` `Optional` **prepareStackTrace**: (`err`: [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error), `stackTraces`: `CallSite`[]) => `any`

#### Type declaration

▸ (`err`, `stackTraces`): `any`

Optional override for formatting stack traces

**`See`**

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

##### Parameters

| Name          | Type                                                                                              |
| :------------ | :------------------------------------------------------------------------------------------------ |
| `err`         | [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error) |
| `stackTraces` | `CallSite`[]                                                                                      |

##### Returns

`any`

#### Inherited from

Error.prepareStackTrace

#### Defined in

node_modules/.pnpm/@types+node@20.11.0/node_modules/@types/node/globals.d.ts:28

---

### stackTraceLimit

▪ `Static` **stackTraceLimit**: `number`

#### Inherited from

Error.stackTraceLimit

#### Defined in

node_modules/.pnpm/@types+node@20.11.0/node_modules/@types/node/globals.d.ts:30

## Methods

### captureStackTrace

▸ `Static` **captureStackTrace**(`targetObject`, `constructorOpt?`): `void`

Create .stack property on a target object

#### Parameters

| Name              | Type                                                                                                    |
| :---------------- | :------------------------------------------------------------------------------------------------------ |
| `targetObject`    | `object`                                                                                                |
| `constructorOpt?` | [`Function`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function) |

#### Returns

`void`

#### Inherited from

Error.captureStackTrace

#### Defined in

node_modules/.pnpm/@types+node@20.11.0/node_modules/@types/node/globals.d.ts:21
