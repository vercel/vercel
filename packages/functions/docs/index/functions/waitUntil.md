[**@vercel/functions**](../../README.md)

---

# Function: waitUntil()

> **waitUntil**(`promise`): `void` \| `undefined`

Defined in: [packages/functions/src/wait-until.ts:19](https://github.com/vercel/vercel/blob/main/packages/functions/src/wait-until.ts#L19)

Extends the lifetime of the request handler for the lifetime of the given [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)

## Parameters

### promise

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`unknown`\>

The promise to wait for.

## Returns

`void` \| `undefined`

## See

https://developer.mozilla.org/en-US/docs/Web/API/ExtendableEvent/waitUntil

## Example

```js
import { waitUntil } from '@vercel/functions';

export function GET(request) {
  waitUntil(fetch('https://vercel.com'));
  return new Response('OK');
}
```
