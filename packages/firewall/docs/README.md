# @vercel/firewall

## Table of contents

### References

- [unstable\_checkRateLimit](README.md#unstable_checkratelimit)

### Functions

- [checkRateLimit](README.md#checkratelimit)

## References

### unstable\_checkRateLimit

Renames and re-exports [checkRateLimit](README.md#checkratelimit)

## Functions

### checkRateLimit

▸ **checkRateLimit**(`rateLimitId`, `options?`): [`Promise`]( https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise )<{ `error?`: ``"not-found"`` \| ``"blocked"`` ; `rateLimited`: `boolean`  }\>

Experimental: Check rate-limits defined through the Vercel Firewall.

This function provides programmatic access to rate limits defined in the Vercel Firewall
from Vercel Functions. The given ID is matched against rate limit rules defined with the same
ID. The return value indicates whether the request is rate limited or not.

**`Example`**

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

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `rateLimitId` | `string` | The ID of the rate limit to check. The same ID must be defined in the Vercel Firewall as a @vercel/firewall rule condition. |
| `options?` | `Object` |  |
| `options.firewallHostForDevelopment?` | `string` | The host name on which the rate limit rules are defined |
| `options.headers?` | `Headers` \| [`Record`]( https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type )<`string`, `string`\> \| [`Record`]( https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type )<`string`, `string` \| `string`[]\> | The headers for the current request. Optional. |
| `options.rateLimitKey?` | `string` | The key to use for rate-limiting. If not defined, defaults to the user's IP address. |
| `options.request?` | `Request` | The current request object. Optional. |

#### Returns

[`Promise`]( https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise )<{ `error?`: ``"not-found"`` \| ``"blocked"`` ; `rateLimited`: `boolean`  }\>

A promise that resolves to an object with a `rateLimited` property that is `true` if the request is rate-limited, and `false` otherwise. The
  `error` property is defined if the request was blocked by the firewall or the rate limit ID was not found.

#### Defined in

[rate-limit.ts:29](https://github.com/vercel/vercel/blob/main/packages/firewall/src/rate-limit.ts#L29)
