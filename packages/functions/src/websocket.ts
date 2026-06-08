import type { Buffer } from 'node:buffer';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import { getContext } from './get-context';

/**
 * WebSocket upgrade primitives for the current request.
 */
export interface WebSocketUpgrade {
  /**
   * The Node.js request associated with the upgrade.
   */
  req: IncomingMessage;
  /**
   * The underlying network socket for the upgrade.
   */
  socket: Duplex;
  /**
   * The first packet of the upgraded stream.
   */
  head: Buffer;
}

/**
 * Returns the WebSocket upgrade primitives for the current request when the
 * Vercel runtime provides them.
 *
 * @example
 *
 * ```js
 * import { getWebSocketUpgrade } from '@vercel/functions/websocket';
 *
 * const upgrade = getWebSocketUpgrade();
 * if (upgrade) {
 *   // Pass upgrade.req, upgrade.socket, and upgrade.head to a WebSocket server.
 * }
 * ```
 */
export function getWebSocketUpgrade(): WebSocketUpgrade | undefined {
  return getContext().upgradeWebSocket?.();
}
