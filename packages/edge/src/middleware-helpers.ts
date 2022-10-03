export interface ModifiedRequest {
  /**
   * If this is set, the request headers will be overridden with this value.
   */
  headers?: Headers;
}

export interface ExtraResponseInit extends Omit<ResponseInit, 'headers'> {
  /**
   * These headers will be sent to the user response
   * along with the response headers from the origin.
   */
  headers?: HeadersInit;
  /**
   * These fields will override the request from clients.
   */
  request?: ModifiedRequest;
}

function handleMiddlewareField(
  init: ExtraResponseInit | undefined,
  headers: Headers
) {
  if (init?.request?.headers) {
    if (!(init.request.headers instanceof Headers)) {
      throw new Error('request.headers must be an instance of Headers');
    }

    const keys = [];
    for (const [key, value] of init.request.headers) {
      headers.set('x-middleware-request-' + key, value);
      keys.push(key);
    }

    headers.set('x-middleware-override-headers', keys.join(','));
  }
}

/**
 * Returns a response that rewrites the request to a different URL.
 *
 * @param destination new URL to rewrite the request to
 * @param init Additional options for the response
 *
 *
 * @example
 * <caption>Rewrite all feature-flagged requests from `/:path*` to `/experimental/:path*`</caption>
 *
 * ```ts
 * import { rewrite, next } from '@vercel/edge';
 *
 * export default async function middleware(req: Request) {
 *   const flagged = await getFlag(req, 'isExperimental');
 *   if (flagged) {
 *     const url = new URL(req.url);
 *     url.pathname = `/experimental{url.pathname}`;
 *     return rewrite(url);
 *   }
 *
 *   return next();
 * }
 * ```
 *
 * @example
 * <caption>JWT authentication for `/api/:path*` requests</caption>
 *
 * ```ts
 * import { rewrite, next } from '@vercel/edge';
 *
 * export default function middleware(req: Request) {
 *   const auth = checkJwt(req.headers.get('Authorization'));
 *   if (!checkJwt) {
 *     return rewrite(new URL('/api/error-unauthorized', req.url));
 *   }
 *   const url = new URL(req.url);
 *   url.searchParams.set('_userId', auth.userId);
 *   return rewrite(url);
 * }
 *
 * export const config = { matcher: '/api/users/:path*' };
 * ```
 */
export function rewrite(
  destination: string | URL,
  init?: ExtraResponseInit
): Response {
  const headers = new Headers(init?.headers ?? {});
  headers.set('x-middleware-rewrite', String(destination));

  handleMiddlewareField(init, headers);

  return new Response(null, {
    ...init,
    headers,
  });
}

/**
 * Returns a Response that instructs the system to continue processing the request.
 *
 * @param init Additional options for the response
 *
 * @example
 * <caption>No-op middleware</caption>
 *
 * ```ts
 * import { next } from '@vercel/edge';
 *
 * export default function middleware(_req: Request) {
 *   return next();
 * }
 * ```
 *
 * @example
 * <caption>Add response headers to all requests</caption>
 *
 * ```ts
 * import { next } from '@vercel/edge';
 *
 * export default function middleware(_req: Request) {
 *   return next({
 *     headers: { 'x-from-middleware': 'true' },
 *   })
 * }
 * ```
 */
export function next(init?: ExtraResponseInit): Response {
  const headers = new Headers(init?.headers ?? {});
  headers.set('x-middleware-next', '1');

  handleMiddlewareField(init, headers);

  return new Response(null, {
    ...init,
    headers,
  });
}
