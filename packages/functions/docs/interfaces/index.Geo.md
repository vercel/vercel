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
- [postalCode](index.Geo.md#region)

## Properties

### city

• `Optional` **city**: `string`

The city that the request originated from.

---

### country

• `Optional` **country**: `string`

The country that the request originated from.

---

### countryRegion

• `Optional` **countryRegion**: `string`

The region part of the ISO 3166-2 code of the client IP.
See [docs](https://vercel.com/docs/concepts/edge-network/headers#x-vercel-ip-country-region).

---

### flag

• `Optional` **flag**: `string`

The flag emoji for the country the request originated from.

---

### latitude

• `Optional` **latitude**: `string`

The latitude of the client.

---

### longitude

• `Optional` **longitude**: `string`

The longitude of the client.

---

### region

• `Optional` **region**: `string`

The [Vercel Edge Network region](https://vercel.com/docs/concepts/edge-network/regions) that received the request.

---

### postalCode

• `Optional` **postalCode**: `string`

The postal code of the client.
