[**@vercel/functions**](../../README.md)

---

# Function: next()

> **next**(`init?`): [`Response`](https://developer.mozilla.org/docs/Web/API/Response)

Defined in: [packages/functions/src/middleware.ts:145](https://github.com/vercel/vercel/blob/main/packages/functions/src/middleware.ts#L145)

Returns a Response that instructs the system to continue processing the request.

## Parameters

### init?

`ExtraResponseInit`

Additional options for the response

## Returns

[`Response`](https://developer.mozilla.org/docs/Web/API/Response)

## Examples

<caption>No-op middleware</caption>

```ts
import { next } from '@vercel/edge';

export default function middleware(_req: Request) {
  return next();
}
```

<caption>Add response headers to all requests</caption>

```ts
import { next } from '@vercel/edge';

export default function middleware(_req: Request) {
  return next({
    headers: { 'x-from-middleware': 'true' },
  });
}
```
