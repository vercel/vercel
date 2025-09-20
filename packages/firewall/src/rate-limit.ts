/**
 * Experimental: Check rate-limits defined through the Vercel Firewall.
 *
 * This function provides programmatic access to rate limits defined in the Vercel Firewall
 * from Vercel Functions. The given ID is matched against rate limit rules defined with the same
 * ID. The return value indicates whether the request is rate limited or not.
 *
 * @param rateLimitId The ID of the rate limit to check. The same ID must be defined in the Vercel Firewall as a @vercel/firewall rule condition.
 * @param options
 * @returns A promise that resolves to an object with a `rateLimited` property that is `true` if the request is rate-limited, and `false` otherwise. The
 *   `error` property is defined if the request was blocked by the firewall or the rate limit ID was not found. The `rateLimitHeaders` property
 *   contains rate limiting information from the firewall API response, including reset time, remaining requests, and retry timing.
 *
 * @example
 * ```js
 * import { unstable_checkRateLimit as checkRateLimit } from '@vercel/firewall';
 *
 * export async function POST() {
 *   const { rateLimited, rateLimitHeaders } = await checkRateLimit('my-rate-limit-id');
 *   if (rateLimited) {
 *     const headers: Record<string, string> = {};
 *     if (rateLimitHeaders?.reset) {
 *       headers['RateLimit-Reset'] = rateLimitHeaders.reset.toString();
 *     }
 *     if (rateLimitHeaders?.retryAfter) {
 *       headers['Retry-After'] = rateLimitHeaders.retryAfter.toString();
 *     }
 *     return new Response('Rate limit exceeded', {
 *       status: 429,
 *       headers,
 *     });
 *   }
 *   // Implement logic guarded by rate limit
 * }
 * ```
 *
 */
export async function checkRateLimit(
  rateLimitId: string,
  options?: {
    /** The host name on which the rate limit rules are defined */
    firewallHostForDevelopment?: string;
    /** The key to use for rate-limiting. If not defined, defaults to the user's IP address. */
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
  /** Rate limiting headers returned by the firewall API */
  rateLimitHeaders?: {
    /** The rate limit threshold (maximum requests allowed) */
    limit?: number;
    /** Number of requests remaining in the current window */
    remaining?: number;
    /** Unix timestamp when the rate limit will reset */
    reset?: number;
    /** Number of seconds until the rate limit resets */
    retryAfter?: number;
  };
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

  const url = `https://${firewallHost}/.well-known/vercel/rate-limit-api/${encodeURIComponent(rateLimitId)}`;

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
      rateLimitHeaders: parseRateLimitHeaders(response),
    };
  }
  if (response.status === 429) {
    return {
      rateLimited: true,
      rateLimitHeaders: parseRateLimitHeaders(response),
    };
  }
  if (response.status === 403) {
    return {
      rateLimited: true,
      error: 'blocked',
      rateLimitHeaders: parseRateLimitHeaders(response),
    };
  }
  if (response.status === 404) {
    console.warn(`Rate-limit ID '${rateLimitId}' not configured`);
    return {
      rateLimited: false,
      error: 'not-found',
      rateLimitHeaders: parseRateLimitHeaders(response),
    };
  }
  throw new Error(
    `Unexpected rate-limit API response status '${rateLimitId}': ${response.status}`
  );
}

export { checkRateLimit as unstable_checkRateLimit };

function parseRateLimitHeaders(response: Response) {
  const headers: {
    limit?: number;
    remaining?: number;
    reset?: number;
    retryAfter?: number;
  } = {};

  const limit =
    response.headers.get('ratelimit-limit') ||
    response.headers.get('x-ratelimit-limit');
  if (limit) {
    const parsed = parseInt(limit, 10);
    if (!isNaN(parsed)) headers.limit = parsed;
  }

  const remaining =
    response.headers.get('ratelimit-remaining') ||
    response.headers.get('x-ratelimit-remaining');
  if (remaining) {
    const parsed = parseInt(remaining, 10);
    if (!isNaN(parsed)) headers.remaining = parsed;
  }

  const reset =
    response.headers.get('ratelimit-reset') ||
    response.headers.get('x-ratelimit-reset');
  if (reset) {
    const parsed = parseInt(reset, 10);
    if (!isNaN(parsed)) headers.reset = parsed;
  }

  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const parsed = parseInt(retryAfter, 10);
    if (!isNaN(parsed)) headers.retryAfter = parsed;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
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
