export interface ExtraResponseInit extends Omit<ResponseInit, 'headers'> {
  /**
   * These headers will be sent to the user response
   * along with the response headers from the origin
   */
  headers?: HeadersInit;
}

/**
 * Rewrite the request into a different URL.
 *
 * @param destination the new URL to rewrite the request to
 * @param init additional options for the response
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
 * Continue with the request without changing the URL
 *
 * @param init additional options for the response
 */
export function next(init?: ExtraResponseInit): Response {
  const headers = new Headers(init?.headers ?? {});
  headers.set('x-middleware-next', '1');
  return new Response(null, {
    ...init,
    headers,
  });
}
