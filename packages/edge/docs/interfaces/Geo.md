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
- [region](Geo.md#region)

## Properties

### city

• `Optional` **city**: `string`

The city that the request originated from.

#### Defined in

[packages/edge/src/edge-headers.ts:50](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L50)

---

### country

• `Optional` **country**: `string`

The country that the request originated from.

#### Defined in

[packages/edge/src/edge-headers.ts:53](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L53)

---

### countryRegion

• `Optional` **countryRegion**: `string`

The region part of the ISO 3166-2 code of the client IP.
See [docs](https://vercel.com/docs/concepts/edge-network/headers#x-vercel-ip-country-region).

#### Defined in

[packages/edge/src/edge-headers.ts:64](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L64)

---

### flag

• `Optional` **flag**: `string`

The flag emoji for the country the request originated from.

#### Defined in

[packages/edge/src/edge-headers.ts:56](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L56)

---

### latitude

• `Optional` **latitude**: `string`

The latitude of the client.

#### Defined in

[packages/edge/src/edge-headers.ts:67](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L67)

---

### longitude

• `Optional` **longitude**: `string`

The longitude of the client.

#### Defined in

[packages/edge/src/edge-headers.ts:70](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L70)

---

### region

• `Optional` **region**: `string`

The [Vercel Edge Network region](https://vercel.com/docs/concepts/edge-network/regions) that received the request.

#### Defined in

[packages/edge/src/edge-headers.ts:59](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L59)
