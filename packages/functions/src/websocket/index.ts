import { WebSocketServer, type WebSocket } from 'ws';
import { getContext } from '../get-context';

export function upgradeWebSocket(): WebSocket {
  const ctx = getContext();

  if (typeof ctx.upgradeWebSocket !== 'function') {
    throw new Error(
      'upgradeWebSocket is not available in the current runtime environment. ' +
        'This feature requires a Vercel runtime that supports WebSocket upgrades.'
    );
  }

  const { req, socket, head } = ctx.upgradeWebSocket();

  const wss = new WebSocketServer({ noServer: true });

  let ws: WebSocket | undefined;
  wss.handleUpgrade(req, socket, head, client => {
    ws = client;
  });

  if (!ws) {
    throw new Error('WebSocket upgrade failed');
  }

  return ws;
}
