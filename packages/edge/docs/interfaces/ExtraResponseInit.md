# Interface: ExtraResponseInit

## Hierarchy

- `Omit`<`ResponseInit`, `"headers"`\>

  ↳ **`ExtraResponseInit`**

## Table of contents

### Properties

- [headers](ExtraResponseInit.md#headers)
- [status](ExtraResponseInit.md#status)
- [statusText](ExtraResponseInit.md#statustext)

## Properties

### headers

• `Optional` **headers**: `HeadersInit`

These headers will be sent to the user response
along with the response headers from the origin.

#### Defined in

src/middleware-helpers.ts:6

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
