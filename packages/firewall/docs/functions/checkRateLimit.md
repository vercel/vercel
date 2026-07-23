[**@vercel/firewall**](../README.md)

---

# Function: checkRateLimit()

> **checkRateLimit**(`rateLimitId`, `options?`): [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<\{ `error?`: `"not-found"` \| `"blocked"`; `rateLimited`: `boolean`; \}\>

Defined in: [rate-limit.ts:75](https://github.com/vercel/vercel/blob/main/packages/firewall/src/rate-limit.ts#L75)

Experimental: Check rate-limits defined through the Vercel Firewall.

This function provides programmatic access to rate limits defined in the Vercel Firewall
from Vercel Functions. The given ID is matched against rate limit rules defined with the same
ID. The return value indicates whether the request is rate limited or not.

## Rate limit key

Every rate limit is counted per key, and the key controls the bucket the current request
counts against.

- By default (when `options.rateLimitKey` is not provided), the request's IP address is used
  as the key, so requests are bucketed per client IP. The IP is read from the `x-real-ip`
  request header; if that header is missing, an error is thrown.
- Passing `options.rateLimitKey` replaces the IP default entirely — the request is bucketed
  by the provided key alone and is no longer implicitly scoped to the caller's IP. To
  preserve per-IP bucketing while adding a custom dimension (for example a user ID), include
  the IP in the key you pass, for example `` `${userId}:${ip}` ``.

The same behavior applies to rate limit rules defined in the Vercel Firewall dashboard that
use a `@vercel/firewall` condition: the rule is keyed by whatever key this SDK provides for
the matching request, rather than by IP.

## Parameters

### rateLimitId

`string`

The ID of the rate limit to check. The same ID must be defined in the Vercel Firewall as a @vercel/firewall rule condition.

### options?

#### firewallHostForDevelopment?

`string`

The host name on which the rate limit rules are defined

#### headers?

`Headers` \| [`Record`](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type)\<`string`, `string`\> \| [`Record`](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type)\<`string`, `string` \| `string`[]\>

The headers for the current request. Optional.

#### rateLimitKey?

`string`

The key to use for rate-limiting. Each unique key gets its own rate limit bucket.

If not defined, defaults to the caller's IP address (read from the `x-real-ip`
request header), so requests are bucketed per IP. Providing a value here replaces
that IP default entirely — the request is bucketed by the provided key alone and
is no longer implicitly scoped to the caller's IP. To preserve per-IP bucketing
while adding a custom dimension (for example a user ID), include the IP in the
key you pass, for example `` `${userId}:${ip}` ``.

#### request?

`Request`

The current request object. Optional.

## Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<\{ `error?`: `"not-found"` \| `"blocked"`; `rateLimited`: `boolean`; \}\>

A promise that resolves to an object with a `rateLimited` property that is `true` if the request is rate-limited, and `false` otherwise. The
`error` property is defined if the request was blocked by the firewall or the rate limit ID was not found.

## Examples

```js
import { unstable_checkRateLimit as checkRateLimit } from '@vercel/firewall';

export async function POST() {
  const { rateLimited } = await checkRateLimit('my-rate-limit-id');
  if (rateLimited) {
    return new Response('', {
      status: 429,
    });
  }
  // Implement logic guarded by rate limit
}
```

Bucket by a custom key (for example a user ID) instead of IP:

```js
import { unstable_checkRateLimit as checkRateLimit } from '@vercel/firewall';

export async function POST(request) {
  const userId = await getUserId(request);
  const { rateLimited } = await checkRateLimit('my-rate-limit-id', {
    rateLimitKey: userId,
  });
  // ...
}
```

Bucket by both IP and a custom dimension by composing them into the key:

```js
import { unstable_checkRateLimit as checkRateLimit } from '@vercel/firewall';

export async function POST(request) {
  const ip = request.headers.get('x-real-ip') ?? '';
  const userId = await getUserId(request);
  const { rateLimited } = await checkRateLimit('my-rate-limit-id', {
    rateLimitKey: `${userId}:${ip}`,
  });
  // ...
}
```
