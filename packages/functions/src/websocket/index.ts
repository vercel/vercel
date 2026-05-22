import { WebSocketServer, type WebSocket } from 'ws';
import { getContext } from '../get-context';

export async function experimental_upgradeWebSocket(
  handler: (ws: WebSocket) => void | Promise<void>
): Promise<Response> {
  const ctx = getContext();

  if (typeof ctx.upgradeWebSocket !== 'function') {
    throw new Error(
      'experimental_upgradeWebSocket is not available in the current runtime environment. ' +
        'This feature requires a Vercel runtime that supports WebSocket upgrades.'
    );
  }

  const { req, socket, head } = ctx.upgradeWebSocket();

  const wss = new WebSocketServer({ noServer: true });

  const ws = await new Promise<WebSocket>((resolve, reject) => {
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

      const error = new Error('WebSocket upgrade failed');
      (error as any).cause = err;
      reject(error);
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

  try {
    await handler(ws);
  } catch (err) {
    ws.close(1011, 'WebSocket handler failed');
    throw err;
  }

  // we've already returned 101 by this point,
  // but frameworks like next.js don't know that.
  // so this secretly lies to next.js when you return it
  // so that it doesn't throw an error.
  return new Response(null, { status: 204 });
}
