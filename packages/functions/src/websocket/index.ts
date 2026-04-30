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

    const rejectUpgrade = (err: unknown) => {
      cleanup();

      if (err instanceof Error) {
        reject(err);
        return;
      }

      reject(new Error('WebSocket upgrade failed', { cause: err }));
    };

    const resolveUpgrade = (ws: WebSocket) => {
      cleanup();
      resolve(ws);
    };

    const onError = (err: Error) => rejectUpgrade(err);
    const onClose = () =>
      rejectUpgrade(
        new Error('socket closed before the WebSocket upgrade completed')
      );

    socket.once('error', onError);
    socket.once('close', onClose);

    try {
      wss.handleUpgrade(req, socket, head, resolveUpgrade);
    } catch (err) {
      rejectUpgrade(err);
    }
  });
}
