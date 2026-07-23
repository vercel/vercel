# @vercel/firewall

## Programmatic rate limits

[See our Firewall docs for detailed documentation of @vercel/firewall.](https://vercel.com/docs/vercel-waf/rate-limiting-sdk)

```ts
import { checkRateLimit } from '@vercel/firewall';

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

### Rate limit key

Every rate limit is counted per key. By default, `checkRateLimit` uses the caller's IP address
as the key (read from the `x-real-ip` request header), so requests are bucketed per IP.

Passing `options.rateLimitKey` replaces the IP default entirely — the request is bucketed by
the provided key alone and is no longer implicitly scoped to the caller's IP. The same applies
to rate limit rules defined in the Vercel Firewall dashboard that use a `@vercel/firewall`
condition: the rule is keyed by whatever key this SDK provides for the matching request,
rather than by IP.

To preserve per-IP bucketing while adding a custom dimension (for example a user ID), include
the IP in the key you pass:

```ts
import { checkRateLimit } from '@vercel/firewall';

export async function POST(request: Request) {
  const ip = request.headers.get('x-real-ip') ?? '';
  const userId = await getUserId(request);
  const { rateLimited } = await checkRateLimit('my-rate-limit-id', {
    rateLimitKey: `${userId}:${ip}`,
  });
  if (rateLimited) {
    return new Response('', { status: 429 });
  }
  // Implement logic guarded by rate limit
}
```

<p align="center">
  <a href="https://vercel.com">
    <img src="https://assets.vercel.com/image/upload/v1588805858/repositories/vercel/logo.png" height="96">
    <h3 align="center">Vercel</h3>
  </a>
  <p align="center">Develop. Preview. Ship.</p>
</p>
