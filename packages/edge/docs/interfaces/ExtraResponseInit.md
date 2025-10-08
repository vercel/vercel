# Interface: ExtraResponseInit

## Hierarchy

- [`Omit`](https://www.typescriptlang.org/docs/handbook/utility-types.html#omittype-keys)<`ResponseInit`, `"headers"`\>

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

packages/functions/middleware.d.ts:30

---

### request

• `Optional` **request**: [`ModifiedRequest`](ModifiedRequest.md)

Fields to rewrite for the upstream request.

#### Defined in

packages/functions/middleware.d.ts:34

---

### status

• `Optional` **status**: `number`

#### Inherited from

Omit.status

#### Defined in

node_modules/typescript/lib/lib.dom.d.ts:1624

---

### statusText

• `Optional` **statusText**: `string`

#### Inherited from

Omit.statusText

#### Defined in

node_modules/typescript/lib/lib.dom.d.ts:1625
