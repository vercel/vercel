import type { NextApiRequest } from 'next';
import { Server } from 'ws';

let wsServer: Server | null = null;

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: NextApiRequest, res: any) {
  if (!res.socket.server.ws) {
    wsServer = new Server({ noServer: true });
    res.socket.server.ws = wsServer;

    res.socket.server.on('upgrade', (request: any, socket: any, head: any) => {
      wsServer?.handleUpgrade(request, socket, head, (ws) => {
        wsServer?.emit('connection', ws, request);
      });
    });

    wsServer.on('connection', (ws) => {
      // Send a test log every second
      const interval = setInterval(() => {
        ws.send(JSON.stringify({ type: 'log', message: `[${new Date().toLocaleTimeString()}] Test log message` }));
      }, 1000);
      ws.on('close', () => clearInterval(interval));
    });
  }
  res.end();
} 