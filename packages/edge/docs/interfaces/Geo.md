[**@vercel/edge**](../README.md)

---

# Interface: Geo

Defined in: packages/functions/headers.d.ts:57

The location information of a given request.

## Properties

### city?

> `optional` **city**: `string`

Defined in: packages/functions/headers.d.ts:59

The city that the request originated from.

---

### country?

> `optional` **country**: `string`

Defined in: packages/functions/headers.d.ts:61

The country that the request originated from.

---

### countryRegion?

> `optional` **countryRegion**: `string`

Defined in: packages/functions/headers.d.ts:69

The region part of the ISO 3166-2 code of the client IP.
See [docs](https://vercel.com/docs/concepts/edge-network/headers#x-vercel-ip-country-region).

---

### flag?

> `optional` **flag**: `string`

Defined in: packages/functions/headers.d.ts:63

The flag emoji for the country the request originated from.

---

### latitude?

> `optional` **latitude**: `string`

Defined in: packages/functions/headers.d.ts:71

The latitude of the client.

---

### longitude?

> `optional` **longitude**: `string`

Defined in: packages/functions/headers.d.ts:73

The longitude of the client.

---

### postalCode?

> `optional` **postalCode**: `string`

Defined in: packages/functions/headers.d.ts:75

The postal code of the client

---

### region?

> `optional` **region**: `string`

Defined in: packages/functions/headers.d.ts:65

The [Vercel Edge Network region](https://vercel.com/docs/concepts/edge-network/regions) that received the request.
