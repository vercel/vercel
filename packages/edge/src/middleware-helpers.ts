export type ExtraInit = {
  /**
   * These headers will be sent to the user response
   * along with the response headers from the origin
   */
  responseHeaders: HeadersInit;
};

/**
 * Rewrite the request into a different URL.
 */
export function rewrite(destination: string | URL, init?: ExtraInit): Response {
  const headers = new Headers(init?.responseHeaders ?? {});
  headers.set('x-middleware-rewrite', String(destination));
  return new Response(null, {
    ...init,
    headers,
  });
}

/**
 * This tells the Middleware to continue with the request.
 */
export function next(init?: ExtraInit): Response {
  const headers = new Headers(init?.responseHeaders ?? {});
  headers.set('x-middleware-next', '1');
  return new Response(null, {
    ...init,
    headers,
  });
}
