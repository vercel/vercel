import type { Duplex } from 'stream';
import { getContext } from '../get-context';
import type { WebSocketUpgradeResult } from './types';

/**
 * Upgrades an incoming HTTP request to a WebSocket connection.
 *
 * Delegates to the runtime bridge, which writes a `101 Switching Protocols`
 * response on the underlying socket and returns the raw duplex stream.
 *
 * @param request - The incoming HTTP request to upgrade.
 * @returns An object containing the raw duplex `socket` and a synthetic 101 `response`.
 * @throws {TypeError} If `request` is not a Request object.
 * @throws {Error} If the runtime does not support WebSocket upgrades, or if
 *   the request is not a WebSocket upgrade request.
 *
 * @example
 *
 * ```ts
 * import { upgradeWebSocket } from '@vercel/functions';
 *
 * export function GET(req: Request) {
 *   const { socket, response } = upgradeWebSocket(req);
 *
 *   socket.on('data', (chunk) => {
 *     // echo raw data back
 *     socket.write(chunk);
 *   });
 *
 *   return response;
 * }
 * ```
 */
export function upgradeWebSocket(request: Request): WebSocketUpgradeResult {
  if (
    request === null ||
    request === undefined ||
    typeof request !== 'object' ||
    !('headers' in request)
  ) {
    throw new TypeError(
      `upgradeWebSocket requires a Request object, got ${typeof request}`
    );
  }

  const ctx = getContext();

  if (typeof ctx.upgradeWebSocket !== 'function') {
    throw new Error(
      'upgradeWebSocket is not available in the current runtime environment. ' +
        'This feature requires a Vercel runtime that supports WebSocket upgrades.'
    );
  }

  const socket = ctx.upgradeWebSocket() as Duplex;

  // Synthetic 101 response for frameworks that require returning a Response.
  // The actual 101 has already been written to the socket by the bridge.
  // Note: `new Response(null, { status: 101 })` throws because the Web API
  // Response constructor only allows 200-599. We create a 200 and override
  // the status to signal the upgrade.
  const response = new Response(null);
  Object.defineProperty(response, 'status', { value: 101 });
  Object.defineProperty(response, 'statusText', {
    value: 'Switching Protocols',
  });

  return { socket, response };
}
