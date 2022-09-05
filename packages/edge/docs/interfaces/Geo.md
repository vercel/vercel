# Interface: Geo

The location information of a given request.

## Table of contents

### Properties

- [city](Geo.md#city)
- [country](Geo.md#country)
- [countryRegion](Geo.md#countryregion)
- [latitude](Geo.md#latitude)
- [longitude](Geo.md#longitude)
- [region](Geo.md#region)

## Properties

### city

• `Optional` **city**: `string`

The city that the request originated from.

#### Defined in

src/edge-headers.ts:47

---

### country

• `Optional` **country**: `string`

The country that the request originated from.

#### Defined in

src/edge-headers.ts:50

---

### countryRegion

• `Optional` **countryRegion**: `string`

The region part of the ISO 3166-2 code of the client IP.
See [docs](https://vercel.com/docs/concepts/edge-network/headers#x-vercel-ip-country-region).

#### Defined in

src/edge-headers.ts:58

---

### latitude

• `Optional` **latitude**: `string`

The latitude of the client.

#### Defined in

src/edge-headers.ts:61

---

### longitude

• `Optional` **longitude**: `string`

The longitude of the client.

#### Defined in

src/edge-headers.ts:64

---

### region

• `Optional` **region**: `string`

The [Vercel Edge Network region](https://vercel.com/docs/concepts/edge-network/regions) that received the request.

#### Defined in

src/edge-headers.ts:53
