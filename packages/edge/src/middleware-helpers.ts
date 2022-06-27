export type ExtraResponseInit = Omit<ResponseInit, 'headers'> & {
  /**
   * These headers will be sent to the user response
   * along with the response headers from the origin
   */
  headers?: HeadersInit;
};

/**
 * Rewrite the request into a different URL.
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
 * This tells the Middleware to continue with the request.
 */
export function next(init?: ExtraResponseInit): Response {
  const headers = new Headers(init?.headers ?? {});
  headers.set('x-middleware-next', '1');
  return new Response(null, {
    ...init,
    headers,
  });
}
