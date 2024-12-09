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

/**
 * Builds a response for returning data based on promise that take many seconds to resolve.
 * The response is returned immediately, but data is only written to it when the promise resolves.
 *
 * @param dataPromise Promise for data to be sent as the response body. Note, that if this promise is
 *     rejected, then a plain text "ERROR" is returned to the cliet. Catch errors on the promise yourself
 *     to add custom error handling.
 * @param init optional custom response status, statusText and headers
 *
 * @example
 * ```ts
 * import { potentiallyLongRunningResponse } from '@vercel/edge';
 *
 * export default () => {
 *   const slowPromise = new Promise((resolve) => setTimeout(() => resolve("Done"), 20000));
 *   return potentiallyLongRunningResponse(slowPromise);
 * };
 * ```
 */
export function potentiallyLongRunningResponse(
  dataPromise: Promise<string | Uint8Array>,
  init?: ResponseInit
): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        dataPromise
          .then((data: string | Uint8Array) => {
            if (typeof data === 'string') {
              controller.enqueue(new TextEncoder().encode(data));
            } else {
              controller.enqueue(data);
            }
            controller.close();
          })
          .catch(error => {
            console.log(
              `Error in 'potentiallyLongRunningResponse' dataPromise: ${error}`
            );
            controller.enqueue(new TextEncoder().encode('ERROR'));
            controller.close();
          });
      },
    }),
    init
  );
}
