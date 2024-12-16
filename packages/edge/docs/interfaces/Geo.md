# Interface: Geo

The location information of a given request.

## Table of contents

### Properties

- [city](Geo.md#city)
- [country](Geo.md#country)
- [countryRegion](Geo.md#countryregion)
- [flag](Geo.md#flag)
- [latitude](Geo.md#latitude)
- [longitude](Geo.md#longitude)
- [postalCode](Geo.md#postalcode)
- [region](Geo.md#region)

## Properties

### city

• `Optional` **city**: `string`

The city that the request originated from.

#### Defined in

[packages/edge/src/edge-headers.ts:45](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L45)

---

### country

• `Optional` **country**: `string`

The country that the request originated from.

#### Defined in

[packages/edge/src/edge-headers.ts:48](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L48)

---

### countryRegion

• `Optional` **countryRegion**: `string`

The region part of the ISO 3166-2 code of the client IP.
See [docs](https://vercel.com/docs/concepts/edge-network/headers#x-vercel-ip-country-region).

#### Defined in

[packages/edge/src/edge-headers.ts:59](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L59)

---

### flag

• `Optional` **flag**: `string`

The flag emoji for the country the request originated from.

#### Defined in

[packages/edge/src/edge-headers.ts:51](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L51)

---

### latitude

• `Optional` **latitude**: `string`

The latitude of the client.

#### Defined in

[packages/edge/src/edge-headers.ts:62](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L62)

---

### longitude

• `Optional` **longitude**: `string`

The longitude of the client.

#### Defined in

[packages/edge/src/edge-headers.ts:65](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L65)

---

### postalCode

• `Optional` **postalCode**: `string`

The postal code of the client.

#### Defined in

[packages/edge/src/edge-headers.ts:68](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L68)

---

### region

• `Optional` **region**: `string`

The [Vercel Edge Network region](https://vercel.com/docs/concepts/edge-network/regions) that received the request.

#### Defined in

[packages/edge/src/edge-headers.ts:54](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L54)
