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

packages/functions/headers.d.ts:59

---

### country

• `Optional` **country**: `string`

The country that the request originated from.

#### Defined in

packages/functions/headers.d.ts:61

---

### countryRegion

• `Optional` **countryRegion**: `string`

The region part of the ISO 3166-2 code of the client IP.
See [docs](https://vercel.com/docs/concepts/edge-network/headers#x-vercel-ip-country-region).

#### Defined in

packages/functions/headers.d.ts:69

---

### flag

• `Optional` **flag**: `string`

The flag emoji for the country the request originated from.

#### Defined in

packages/functions/headers.d.ts:63

---

### latitude

• `Optional` **latitude**: `string`

The latitude of the client.

#### Defined in

packages/functions/headers.d.ts:71

---

### longitude

• `Optional` **longitude**: `string`

The longitude of the client.

#### Defined in

packages/functions/headers.d.ts:73

---

### postalCode

• `Optional` **postalCode**: `string`

The postal code of the client

#### Defined in

packages/functions/headers.d.ts:75

---

### region

• `Optional` **region**: `string`

The [Vercel Edge Network region](https://vercel.com/docs/concepts/edge-network/regions) that received the request.

#### Defined in

packages/functions/headers.d.ts:65
