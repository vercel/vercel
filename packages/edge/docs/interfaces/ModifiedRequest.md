# Interface: ModifiedRequest

## Table of contents

### Properties

- [headers](ModifiedRequest.md#headers)

## Properties

### headers

• `Optional` **headers**: `Headers`

If set, overwrites the incoming headers to the origin request.

This is useful when you want to pass data between a Middleware and a
Serverless or Edge Function.

**`Example`**

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

#### Defined in

[src/middleware-helpers.ts:23](https://github.com/vercel/vercel/blob/main/packages/edge/src/middleware-helpers.ts#L23)
