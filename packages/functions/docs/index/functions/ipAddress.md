[**@vercel/functions**](../../README.md)

---

# Function: ipAddress()

> **ipAddress**(`input`): `string` \| `undefined`

Defined in: [packages/functions/src/headers.ts:131](https://github.com/vercel/vercel/blob/main/packages/functions/src/headers.ts#L131)

Returns the IP address of the request from the headers.

## Parameters

### input

The incoming request object or headers.

`Headers` | [`Request`](../interfaces/Request.md)

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
