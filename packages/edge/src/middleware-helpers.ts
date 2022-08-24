export interface ExtraResponseInit extends Omit<ResponseInit, 'headers'> {
  /**
   * These headers will be sent to the user response
   * along with the response headers from the origin
   */
  headers?: HeadersInit;
}

/**
 * Returns a response that rewrites the request to a different URL.
 *
 * @param destination the new URL to rewrite the request to
 * @param init additional options for the response
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
  return new Response(null, {
    ...init,
    headers,
  });
}

/**
 * Returns a Response that instructs the system to continue processing the request.
 *
 * @param init additional options for the response
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
 * <caption>Add a response headers to all requests</caption>
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
  return new Response(null, {
    ...init,
    headers,
  });
}
