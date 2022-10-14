# Interface: ExtraResponseInit

## Hierarchy

- `Omit`<`ResponseInit`, `"headers"`\>

  ↳ **`ExtraResponseInit`**

## Table of contents

### Properties

- [headers](ExtraResponseInit.md#headers)
- [request](ExtraResponseInit.md#request)
- [status](ExtraResponseInit.md#status)
- [statusText](ExtraResponseInit.md#statustext)

## Properties

### headers

• `Optional` **headers**: `HeadersInit`

These headers will be sent to the user response
along with the response headers from the origin.

#### Defined in

[src/middleware-helpers.ts:13](https://github.com/vercel/vercel/blob/main/packages/edge/src/middleware-helpers.ts#L13)

---

### request

• `Optional` **request**: [`ModifiedRequest`](ModifiedRequest.md)

These fields will override the request from clients.

#### Defined in

[src/middleware-helpers.ts:17](https://github.com/vercel/vercel/blob/main/packages/edge/src/middleware-helpers.ts#L17)

---

### status

• `Optional` **status**: `number`

#### Inherited from

Omit.status

#### Defined in

node_modules/typescript/lib/lib.dom.d.ts:1578

---

### statusText

• `Optional` **statusText**: `string`

#### Inherited from

Omit.statusText

#### Defined in

node_modules/typescript/lib/lib.dom.d.ts:1579
