# Class: RefreshFailedError

Error thrown when attempting to refresh the authentication token fails.
This includes cases where no refresh token is available.

## Hierarchy

- [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error)

  ↳ **`RefreshFailedError`**

## Table of contents

### Constructors

- [constructor](RefreshFailedError.md#constructor)

### Properties

- [cause](RefreshFailedError.md#cause)
- [message](RefreshFailedError.md#message)
- [name](RefreshFailedError.md#name)
- [stack](RefreshFailedError.md#stack)
- [prepareStackTrace](RefreshFailedError.md#preparestacktrace)
- [stackTraceLimit](RefreshFailedError.md#stacktracelimit)

### Methods

- [captureStackTrace](RefreshFailedError.md#capturestacktrace)

## Constructors

### constructor

• **new RefreshFailedError**(`cause?`)

#### Parameters

| Name     | Type      |
| :------- | :-------- |
| `cause?` | `unknown` |

#### Overrides

Error.constructor

#### Defined in

[packages/oidc/src/auth-errors.ts:19](https://github.com/vercel/vercel/blob/main/packages/oidc/src/auth-errors.ts#L19)

## Properties

### cause

• `Optional` **cause**: `unknown`

#### Defined in

[packages/oidc/src/auth-errors.ts:18](https://github.com/vercel/vercel/blob/main/packages/oidc/src/auth-errors.ts#L18)

---

### message

• **message**: `string`

#### Inherited from

Error.message

#### Defined in

node_modules/.pnpm/typescript@4.9.5/node_modules/typescript/lib/lib.es5.d.ts:1054

---

### name

• **name**: `string` = `'RefreshFailedError'`

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
