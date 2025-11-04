[**@vercel/functions**](../../README.md)

---

# Interface: Geo

Defined in: [packages/functions/src/headers.ts:57](https://github.com/vercel/vercel/blob/main/packages/functions/src/headers.ts#L57)

The location information of a given request.

## Properties

### city?

> `optional` **city**: `string`

Defined in: [packages/functions/src/headers.ts:59](https://github.com/vercel/vercel/blob/main/packages/functions/src/headers.ts#L59)

The city that the request originated from.

---

### country?

> `optional` **country**: `string`

Defined in: [packages/functions/src/headers.ts:62](https://github.com/vercel/vercel/blob/main/packages/functions/src/headers.ts#L62)

The country that the request originated from.

---

### countryRegion?

> `optional` **countryRegion**: `string`

Defined in: [packages/functions/src/headers.ts:73](https://github.com/vercel/vercel/blob/main/packages/functions/src/headers.ts#L73)

The region part of the ISO 3166-2 code of the client IP.
See [docs](https://vercel.com/docs/concepts/edge-network/headers#x-vercel-ip-country-region).

---

### flag?

> `optional` **flag**: `string`

Defined in: [packages/functions/src/headers.ts:65](https://github.com/vercel/vercel/blob/main/packages/functions/src/headers.ts#L65)

The flag emoji for the country the request originated from.

---

### latitude?

> `optional` **latitude**: `string`

Defined in: [packages/functions/src/headers.ts:76](https://github.com/vercel/vercel/blob/main/packages/functions/src/headers.ts#L76)

The latitude of the client.

---

### longitude?

> `optional` **longitude**: `string`

Defined in: [packages/functions/src/headers.ts:79](https://github.com/vercel/vercel/blob/main/packages/functions/src/headers.ts#L79)

The longitude of the client.

---

### postalCode?

> `optional` **postalCode**: `string`

Defined in: [packages/functions/src/headers.ts:82](https://github.com/vercel/vercel/blob/main/packages/functions/src/headers.ts#L82)

The postal code of the client

---

### region?

> `optional` **region**: `string`

Defined in: [packages/functions/src/headers.ts:68](https://github.com/vercel/vercel/blob/main/packages/functions/src/headers.ts#L68)

The [Vercel Edge Network region](https://vercel.com/docs/concepts/edge-network/regions) that received the request.
