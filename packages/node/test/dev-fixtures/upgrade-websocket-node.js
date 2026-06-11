import { experimental_upgradeWebSocket } from '@vercel/functions';

export async function GET() {
  return experimental_upgradeWebSocket(ws => {
    ws.send('ok');
    ws.close();
  });
}
