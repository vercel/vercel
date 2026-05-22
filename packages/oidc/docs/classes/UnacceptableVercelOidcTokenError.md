[**@vercel/oidc**](../README.md)

---

# Class: UnacceptableVercelOidcTokenError

Defined in: [packages/oidc/src/validate.ts:91](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L91)

Thrown by [assertValidVercelOidcToken](../functions/assertValidVercelOidcToken.md) when a token cannot be accepted.

## Extends

- [`Error`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Error)

## Constructors

### Constructor

> **new UnacceptableVercelOidcTokenError**(`message`, `cause?`): `UnacceptableVercelOidcTokenError`

Defined in: [packages/oidc/src/validate.ts:94](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L94)

#### Parameters

##### message

`string`

##### cause?

`unknown`

#### Returns

`UnacceptableVercelOidcTokenError`

#### Overrides

`Error.constructor`

## Properties

### cause?

> `optional` **cause?**: `unknown`

Defined in: [packages/oidc/src/validate.ts:92](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L92)

---

### message

> **message**: `string`

Defined in: node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/lib.es5.d.ts:1077

#### Inherited from

`Error.message`

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

### toString()

> **toString**(): `string`

Defined in: [packages/oidc/src/validate.ts:100](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L100)

Returns a string representation of an object.

#### Returns

`string`

---

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
