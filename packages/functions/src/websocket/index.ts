import { WebSocketServer, type WebSocket } from 'ws';
import { getContext } from '../get-context';

const wss = new WebSocketServer({ noServer: true });

export function upgradeWebSocket(): WebSocket {
  const ctx = getContext();

  if (typeof ctx.upgradeWebSocket !== 'function') {
    throw new Error(
      'upgradeWebSocket is not available in the current runtime environment. ' +
        'This feature requires a Vercel runtime that supports WebSocket upgrades.'
    );
  }

  const { req, socket, head } = ctx.upgradeWebSocket();

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

  return ws;
}
