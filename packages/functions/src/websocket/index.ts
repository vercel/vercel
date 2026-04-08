import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
import { getContext } from '../get-context';
import type { WebSocketUpgradeResult } from './types';

const wss = new WebSocketServer({ noServer: true });

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

  // Use ws to perform the WebSocket handshake and set up framing.
  // ws writes the 101 Switching Protocols response to the socket
  // and returns a fully-framed WebSocket in the callback.
  let ws: WebSocket | undefined;
  wss.handleUpgrade(req, socket, head, client => {
    ws = client;
    wss.emit('connection', client, req);
  });

  if (!ws) {
    throw new Error('WebSocket upgrade failed');
  }

  // Synthetic 101 response for frameworks that require returning a Response.
  // The actual 101 has already been written to the socket by ws.
  const response = new Response(null);
  Object.defineProperty(response, 'status', { value: 101 });
  Object.defineProperty(response, 'statusText', {
    value: 'Switching Protocols',
  });

  return { socket: ws, response };
}
