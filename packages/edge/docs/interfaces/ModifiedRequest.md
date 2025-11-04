[**@vercel/edge**](../README.md)

---

# Interface: ModifiedRequest

Defined in: packages/functions/middleware.d.ts:1

## Properties

### headers?

> `optional` **headers**: [`Headers`](https://developer.mozilla.org/docs/Web/API/Headers)

Defined in: packages/functions/middleware.d.ts:23

If set, overwrites the incoming headers to the origin request.

This is useful when you want to pass data between a Middleware and a
Serverless or Edge Function.

#### Example

<caption>Add a `x-user-id` header and remove the `Authorization` header</caption>

```ts
import { rewrite } from '@vercel/edge';
export default async function middleware(request: Request): Promise<Response> {
  const newHeaders = new Headers(request.headers);
  newHeaders.set('x-user-id', 'user_123');
  newHeaders.delete('authorization');
  return rewrite(request.url, {
    request: { headers: newHeaders },
  });
}
```
