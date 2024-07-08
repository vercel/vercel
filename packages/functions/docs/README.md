# @vercel/functions

## Table of contents

### Functions

- [geolocation](README.md#geolocation)
- [ipAddress](README.md#ipaddress)
- [waitUntil](README.md#waituntil)

## Functions

### geolocation

▸ **geolocation**(`request`): `Geo`

Returns the location information for the incoming request.

**`See`**

- CITY_HEADER_NAME
- COUNTRY_HEADER_NAME
- REGION_HEADER_NAME
- LATITUDE_HEADER_NAME
- LONGITUDE_HEADER_NAME

#### Parameters

| Name      | Type      | Description                                                     |
| :-------- | :-------- | :-------------------------------------------------------------- |
| `request` | `Request` | The incoming request object which provides the geolocation data |

#### Returns

`Geo`

#### Defined in

[headers.ts:128](https://github.com/vercel/vercel/blob/main/packages/functions/src/headers.ts#L128)

---

### ipAddress

▸ **ipAddress**(`request`): `string` \| `undefined`

Returns the IP address of the request from the headers.

**`See`**

IP_HEADER_NAME

#### Parameters

| Name      | Type      | Description                                       |
| :-------- | :-------- | :------------------------------------------------ |
| `request` | `Request` | The incoming request object which provides the IP |

#### Returns

`string` \| `undefined`

#### Defined in

[headers.ts:99](https://github.com/vercel/vercel/blob/main/packages/functions/src/headers.ts#L99)

---

### waitUntil

▸ **waitUntil**(`promise`): `undefined` \| `void`

Extends the lifetime of the request handler for the lifetime of the given Promise

**`See`**

https://developer.mozilla.org/en-US/docs/Web/API/ExtendableEvent/waitUntil

**`Example`**

```
import { waitUntil } from '@vercel/functions';

export function GET(request) {
  waitUntil(fetch('https://vercel.com'));
  return new Response('OK');
}
```

#### Parameters

| Name      | Type                                                                                                              | Description              |
| :-------- | :---------------------------------------------------------------------------------------------------------------- | :----------------------- |
| `promise` | [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`unknown`\> | The promise to wait for. |

#### Returns

`undefined` \| `void`

#### Defined in

[wait-until.ts:23](https://github.com/vercel/vercel/blob/main/packages/functions/src/wait-until.ts#L23)
