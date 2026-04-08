import { WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
import { getContext } from '../get-context';
import type { WebSocketUpgradeResult } from './types';

const wss = new WebSocketServer({ noServer: true });

/**
 * Upgrades an incoming HTTP request to a WebSocket connection.
 *
 * Delegates to the runtime bridge, which writes a `101 Switching Protocols`
 * response on the underlying socket, detaches it from the framework's
 * response, and returns the raw `(req, socket, head)` tuple. This function
 * then uses `ws` to complete the WebSocket handshake and returns a
 * fully-framed `WebSocket` instance.
 *
 * @param request - The incoming HTTP request to upgrade.
 * @returns An object containing the `socket` (a `ws` WebSocket) and a synthetic 101 `response`.
 * @throws {TypeError} If `request` is not a Request object.
 * @throws {Error} If the runtime does not support WebSocket upgrades.
 *
 * @example
 *
 * ```ts
 * import { upgradeWebSocket } from '@vercel/functions';
 *
 * export function GET(req: Request) {
 *   const { socket, response } = upgradeWebSocket(req);
 *   socket.onmessage = (event) => {
 *     socket.send(`echo: ${event.data}`);
 *   };
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

  const upgrade = ctx.upgradeWebSocket();
  const req = upgrade.req as IncomingMessage;
  const socket = upgrade.socket as Socket;
  const head = upgrade.head as Buffer;

  // Use ws to handle WebSocket framing on the already-upgraded socket.
  // The 101 handshake has already been written by the bridge, so we
  // use handleUpgrade's callback to get a fully-framed WebSocket.
  let ws: import('ws').WebSocket;
  wss.handleUpgrade(req, socket, head, client => {
    ws = client;
    wss.emit('connection', client, req);
  });

  // Synthetic 101 response for frameworks that require returning a Response.
  // The actual 101 has already been written to the socket by the bridge.
  const response = new Response(null);
  Object.defineProperty(response, 'status', { value: 101 });
  Object.defineProperty(response, 'statusText', {
    value: 'Switching Protocols',
  });

  return { socket: ws!, response };
}
