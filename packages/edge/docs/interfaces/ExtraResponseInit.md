[**@vercel/edge**](../README.md)

---

# Interface: ExtraResponseInit

Defined in: packages/functions/middleware.d.ts:25

## Extends

- [`Omit`](https://www.typescriptlang.org/docs/handbook/utility-types.html#omittype-keys)\<`ResponseInit`, `"headers"`\>

## Properties

### headers?

> `optional` **headers**: `HeadersInit`

Defined in: packages/functions/middleware.d.ts:30

These headers will be sent to the user response
along with the response headers from the origin.

---

### request?

> `optional` **request**: [`ModifiedRequest`](ModifiedRequest.md)

Defined in: packages/functions/middleware.d.ts:34

Fields to rewrite for the upstream request.

---

### status?

> `optional` **status**: `number`

Defined in: node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/lib.dom.d.ts:2075

#### Inherited from

`Omit.status`

---

### statusText?

> `optional` **statusText**: `string`

Defined in: node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/lib.dom.d.ts:2076

#### Inherited from

`Omit.statusText`
