[@vercel/edge](../README.md) / [Exports](../modules.md) / Geo

# Interface: Geo

The location information of a given request

## Table of contents

### Properties

- [city](Geo.md#city)
- [country](Geo.md#country)
- [latitude](Geo.md#latitude)
- [longitude](Geo.md#longitude)
- [region](Geo.md#region)

## Properties

### city

• `Optional` **city**: `string`

The city that the request originated from

#### Defined in

[src/edge-headers.ts:41](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L41)

---

### country

• `Optional` **country**: `string`

The country that the request originated from

#### Defined in

[src/edge-headers.ts:43](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L43)

---

### latitude

• `Optional` **latitude**: `string`

The latitude of the client

#### Defined in

[src/edge-headers.ts:47](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L47)

---

### longitude

• `Optional` **longitude**: `string`

The longitude of the client

#### Defined in

[src/edge-headers.ts:49](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L49)

---

### region

• `Optional` **region**: `string`

The Vercel Edge Network region that received the request

#### Defined in

[src/edge-headers.ts:45](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L45)
