/**
 * Experimental: Check rate-limits defined through the Vercel Firewall.
 *
 * This function provides programmatic access to rate limits defined in the Vercel Firewall
 * from Vercel Functions. The given ID is matched against rate limit rules defined with the same
 * ID. The return value indicates whether the request is rate limited or not.
 *
 * ## Rate limit key
 *
 * Every rate limit is counted per key, and the key controls the bucket the current request
 * counts against.
 *
 * - By default (when `options.rateLimitKey` is not provided), the request's IP address is used
 *   as the key, so requests are bucketed per client IP. The IP is read from the `x-real-ip`
 *   request header; if that header is missing, an error is thrown.
 * - Passing `options.rateLimitKey` replaces the IP default entirely — the request is bucketed
 *   by the provided key alone and is no longer implicitly scoped to the caller's IP. To
 *   preserve per-IP bucketing while adding a custom dimension (for example a user ID), include
 *   the IP in the key you pass, for example `` `${userId}:${ip}` ``.
 *
 * The same behavior applies to rate limit rules defined in the Vercel Firewall dashboard that
 * use a `@vercel/firewall` condition: the rule is keyed by whatever key this SDK provides for
 * the matching request, rather than by IP.
 *
 * @param rateLimitId The ID of the rate limit to check. The same ID must be defined in the Vercel Firewall as a @vercel/firewall rule condition.
 * @param options
 * @returns A promise that resolves to an object with a `rateLimited` property that is `true` if the request is rate-limited, and `false` otherwise. The
 *   `error` property is defined if the request was blocked by the firewall or the rate limit ID was not found.
 *
 * @example
 * ```js
 * import { unstable_checkRateLimit as checkRateLimit } from '@vercel/firewall';
 *
 * export async function POST() {
 *   const { rateLimited } = await checkRateLimit('my-rate-limit-id');
 *   if (rateLimited) {
 *     return new Response('', {
 *       status: 429,
 *     });
 *   }
 *   // Implement logic guarded by rate limit
 * }
 * ```
 *
 * @example
 * Bucket by a custom key (for example a user ID) instead of IP:
 * ```js
 * import { unstable_checkRateLimit as checkRateLimit } from '@vercel/firewall';
 *
 * export async function POST(request) {
 *   const userId = await getUserId(request);
 *   const { rateLimited } = await checkRateLimit('my-rate-limit-id', {
 *     rateLimitKey: userId,
 *   });
 *   // ...
 * }
 * ```
 *
 * @example
 * Bucket by both IP and a custom dimension by composing them into the key:
 * ```js
 * import { unstable_checkRateLimit as checkRateLimit } from '@vercel/firewall';
 *
 * export async function POST(request) {
 *   const ip = request.headers.get('x-real-ip') ?? '';
 *   const userId = await getUserId(request);
 *   const { rateLimited } = await checkRateLimit('my-rate-limit-id', {
 *     rateLimitKey: `${userId}:${ip}`,
 *   });
 *   // ...
 * }
 * ```
 *
 */
export async function checkRateLimit(
  rateLimitId: string,
  options?: {
    /** The host name on which the rate limit rules are defined */
    firewallHostForDevelopment?: string;
    /**
     * The key to use for rate-limiting. Each unique key gets its own rate limit bucket.
     *
     * If not defined, defaults to the caller's IP address (read from the `x-real-ip`
     * request header), so requests are bucketed per IP. Providing a value here replaces
     * that IP default entirely — the request is bucketed by the provided key alone and
     * is no longer implicitly scoped to the caller's IP. To preserve per-IP bucketing
     * while adding a custom dimension (for example a user ID), include the IP in the
     * key you pass, for example `` `${userId}:${ip}` ``.
     */
    rateLimitKey?: string;
    /** The headers for the current request. Optional.  */
    headers?:
      | Headers
      | Record<string, string>
      | Record<string, string | string[]>;
    /** The current request object. Optional. */
    request?: Request;
  }
): Promise<{
  rateLimited: boolean;
  error?: 'not-found' | 'blocked';
}> {
  if (
    process.env.NODE_ENV !== 'production' &&
    !options?.firewallHostForDevelopment
  ) {
    console.warn(
      'Provide the `firewallHostForDevelopment` option to support rate-limiting in development mode'
    );
    return {
      rateLimited: false,
    };
  }

  let requestHeaders = options?.headers || options?.request?.headers;
  if (requestHeaders && !(requestHeaders instanceof Headers)) {
    requestHeaders = new Headers(requestHeaders);
  }
  if (!requestHeaders) {
    const context = getContext();
    if (context.headers) {
      requestHeaders = new Headers(context.headers);
    }
  }

  if (!requestHeaders) {
    throw new Error('`headers` or `request` options are required');
  }

  let firewallHost = requestHeaders.get('host') || undefined;
  if (process.env.NODE_ENV !== 'production') {
    firewallHost =
      options?.firewallHostForDevelopment !== 'ignore-for-testing'
        ? options?.firewallHostForDevelopment
        : firewallHost;
  }

  let fullRateLimitKey = options?.rateLimitKey;
  if (!fullRateLimitKey) {
    fullRateLimitKey = requestHeaders.get('x-real-ip') || undefined;
    if (!fullRateLimitKey) {
      throw new Error(
        'Could not determine rate limit key. `rateLimitKey` option is not provided, and `x-real-ip` header is not present in the request.'
      );
    }
  }

  let pathPrefix =
    process.env.PUBLIC_VERCEL_FIREWALL_PATH_PREFIX ||
    process.env.NEXT_PUBLIC_VERCEL_FIREWALL_PATH_PREFIX ||
    '';
  if (pathPrefix && !pathPrefix.startsWith('/')) {
    pathPrefix = `/${pathPrefix}`;
  }
  const url = `https://${firewallHost}${pathPrefix}/.well-known/vercel/rate-limit-api/${encodeURIComponent(rateLimitId)}`;

  fullRateLimitKey = `${fullRateLimitKey}-${await hashString(
    fullRateLimitKey +
      rateLimitId +
      (process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '') +
      (process.env.RATE_LIMIT_SECRET || '')
  )}`;

  const rateLimitHeaders = new Headers({
    'x-vercel-rate-limit-api': rateLimitId,
    'x-vercel-rate-limit-key': fullRateLimitKey,
    'user-agent': 'Bot/Vercel Rate Limit Checker',
    'x-forwarded-for': requestHeaders.get('x-forwarded-for') || '',
    'x-real-ip': requestHeaders.get('x-real-ip') || '',
    'x-vercel-protection-bypass':
      process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '',
  });
  const cookies = parseCookies(requestHeaders);
  // Forward the auth cookie if it exists.
  if (cookies._vercel_jwt) {
    rateLimitHeaders.append('cookie', `_vercel_jwt=${cookies._vercel_jwt}`);
  }

  for (const [key, value] of requestHeaders.entries()) {
    rateLimitHeaders.append(`x-rr-${key}`, value);
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: rateLimitHeaders,
    redirect: 'manual',
  });

  if (response.status === 204) {
    return {
      rateLimited: false,
    };
  }
  if (response.status === 429) {
    return {
      rateLimited: true,
    };
  }
  if (response.status === 403) {
    return {
      rateLimited: true,
      error: 'blocked',
    };
  }
  if (response.status === 404) {
    console.warn(`Rate-limit ID '${rateLimitId}' not configured`);
    return {
      rateLimited: false,
      error: 'not-found',
    };
  }
  throw new Error(
    `Unexpected rate-limit API response status '${rateLimitId}': ${response.status}`
  );
}

export { checkRateLimit as unstable_checkRateLimit };

async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const subtle = (globalThis as any).crypto.subtle;
  const hashBuffer = await subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  return hashHex;
}

const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');

type Context = {
  headers?: Record<string, string>;
};

function getContext(): Context {
  const fromSymbol: typeof globalThis & {
    [SYMBOL_FOR_REQ_CONTEXT]?: { get?: () => Context };
  } = globalThis;
  return fromSymbol[SYMBOL_FOR_REQ_CONTEXT]?.get?.() ?? {};
}

function parseCookies(requestHeaders: Headers): Record<string, string> {
  const cookies = requestHeaders.get('cookie');
  if (!cookies) {
    return {};
  }
  return cookies.split(';').reduce(
    (acc, cookie) => {
      const trimmedCookie = cookie.trim();
      const equalIndex = trimmedCookie.indexOf('=');
      if (equalIndex === -1) {
        // Cookie without value
        acc[trimmedCookie] = '';
      } else {
        const key = trimmedCookie.slice(0, equalIndex);
        const value = trimmedCookie.slice(equalIndex + 1);
        acc[key] = value;
      }
      return acc;
    },
    {} as Record<string, string>
  );
}
