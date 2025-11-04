[**@vercel/edge**](../README.md)

---

# Function: rewrite()

> **rewrite**(`destination`, `init?`): [`Response`](https://developer.mozilla.org/docs/Web/API/Response)

Defined in: packages/functions/middleware.d.ts:80

Returns a response that rewrites the request to a different URL.

## Parameters

### destination

new URL to rewrite the request to

`string` | [`URL`](https://developer.mozilla.org/docs/Web/API/URL)

### init?

[`ExtraResponseInit`](../interfaces/ExtraResponseInit.md)

Additional options for the response

## Returns

[`Response`](https://developer.mozilla.org/docs/Web/API/Response)

## Examples

<caption>Rewrite all feature-flagged requests from `/:path*` to `/experimental/:path*`</caption>

```ts
import { rewrite, next } from '@vercel/edge';

export default async function middleware(req: Request) {
  const flagged = await getFlag(req, 'isExperimental');
  if (flagged) {
    const url = new URL(req.url);
    url.pathname = `/experimental{url.pathname}`;
    return rewrite(url);
  }

  return next();
}
```

<caption>JWT authentication for `/api/:path*` requests</caption>

```ts
import { rewrite, next } from '@vercel/edge';

export default function middleware(req: Request) {
  const auth = checkJwt(req.headers.get('Authorization'));
  if (!checkJwt) {
    return rewrite(new URL('/api/error-unauthorized', req.url));
  }
  const url = new URL(req.url);
  url.searchParams.set('_userId', auth.userId);
  return rewrite(url);
}

export const config = { matcher: '/api/users/:path*' };
```
