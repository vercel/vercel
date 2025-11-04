[**@vercel/edge**](../README.md)

---

# Function: ipAddress()

> **ipAddress**(`input`): `string` \| `undefined`

Defined in: packages/functions/headers.d.ts:95

Returns the IP address of the request from the headers.

## Parameters

### input

The incoming request object or headers.

[`Request`](../interfaces/Request.md) | [`Headers`](../interfaces/Headers.md)

## Returns

`string` \| `undefined`

The IP address of the request.

## Example

```js
import { ipAddress } from '@vercel/functions';

export function GET(request) {
  const ip = ipAddress(request);
  return new Response(`Your IP is ${ip}`);
}
```
