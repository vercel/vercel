import { WebSocketServer, type WebSocket } from 'ws';
import { getContext } from '../get-context';

export async function upgradeWebSocket(): Promise<WebSocket> {
  const ctx = getContext();

  if (typeof ctx.upgradeWebSocket !== 'function') {
    throw new Error(
      'upgradeWebSocket is not available in the current runtime environment. ' +
        'This feature requires a Vercel runtime that supports WebSocket upgrades.'
    );
  }

  const { req, socket, head } = ctx.upgradeWebSocket();

  const wss = new WebSocketServer({ noServer: true });

  return new Promise<WebSocket>((resolve, reject) => {
    const cleanup = () => {
      socket.removeListener('error', onError);
      socket.removeListener('close', onClose);
    };

    const done = (err?: unknown, ws?: WebSocket) => {
      cleanup();

      if (err) {
        const message = err instanceof Error ? err.message : String(err);
        reject(new Error(`WebSocket upgrade failed: ${message}`));
        return;
      }

      if (ws) {
        resolve(ws);
        return;
      }

      reject(new Error('WebSocket upgrade failed'));
    };

    const onError = (err: Error) => done(err);
    const onClose = () =>
      done('socket closed before the WebSocket upgrade completed');

    socket.once('error', onError);
    socket.once('close', onClose);

    try {
      wss.handleUpgrade(req, socket, head, client => done(undefined, client));
    } catch (err) {
      done(err);
    }
  });
}
