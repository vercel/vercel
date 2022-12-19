/**
 * Builds a response object from a serializable JavaScript object:
 * - sets the 'Content-Type' response header to 'application/json'
 * - sets the response body from provided data
 *
 * @see {@link https://fetch.spec.whatwg.org/#dom-response-json}
 * @param data serialized data
 * @param init optional custom response status, statusText and headers
 *
 * @example
 * <caption>Building a JSON response</caption>
 *
 * ```ts
 * import { json } from '@vercel/edge';
 *
 * const response = json({ notification: { success: true, content: 'worked' } }, { headers: {'x-custom': '1' }})
 * ```
 */
export function json(data: any, init?: ResponseInit): Response {
  // @ts-expect-error This is not in lib/dom right now, and we can't augment it.
  return Response.json(data, init);
}
