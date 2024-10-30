# Interface: Geo

[index](../modules/index.md).Geo

The location information of a given request.

## Table of contents

### Properties

- [city](index.Geo.md#city)
- [country](index.Geo.md#country)
- [countryRegion](index.Geo.md#countryregion)
- [flag](index.Geo.md#flag)
- [latitude](index.Geo.md#latitude)
- [longitude](index.Geo.md#longitude)
- [region](index.Geo.md#region)

## Properties

### city

• `Optional` **city**: `string`

The city that the request originated from.

#### Defined in

[packages/functions/src/headers.ts:55](https://github.com/vercel/vercel/blob/main/packages/functions/src/headers.ts#L55)

---

### country

• `Optional` **country**: `string`

The country that the request originated from.

#### Defined in

[packages/functions/src/headers.ts:58](https://github.com/vercel/vercel/blob/main/packages/functions/src/headers.ts#L58)

---

### countryRegion

• `Optional` **countryRegion**: `string`

The region part of the ISO 3166-2 code of the client IP.
See [docs](https://vercel.com/docs/concepts/edge-network/headers#x-vercel-ip-country-region).

#### Defined in

[packages/functions/src/headers.ts:69](https://github.com/vercel/vercel/blob/main/packages/functions/src/headers.ts#L69)

---

### flag

• `Optional` **flag**: `string`

The flag emoji for the country the request originated from.

#### Defined in

[packages/functions/src/headers.ts:61](https://github.com/vercel/vercel/blob/main/packages/functions/src/headers.ts#L61)

---

### latitude

• `Optional` **latitude**: `string`

The latitude of the client.

#### Defined in

[packages/functions/src/headers.ts:72](https://github.com/vercel/vercel/blob/main/packages/functions/src/headers.ts#L72)

---

### longitude

• `Optional` **longitude**: `string`

The longitude of the client.

#### Defined in

[packages/functions/src/headers.ts:75](https://github.com/vercel/vercel/blob/main/packages/functions/src/headers.ts#L75)

---

### region

• `Optional` **region**: `string`

The [Vercel Edge Network region](https://vercel.com/docs/concepts/edge-network/regions) that received the request.

#### Defined in

[packages/functions/src/headers.ts:64](https://github.com/vercel/vercel/blob/main/packages/functions/src/headers.ts#L64)
