import { randomUUID } from 'crypto';
import { QueueClient } from '@vercel/queue';

// `vc dev` exposes its queue broker through these env vars; point the client
// at it instead of the OIDC-authenticated production Queue service.
const { send } = new QueueClient({
  token: process.env.VERCEL_QUEUE_TOKEN,
  resolveBaseUrl: () => new URL(process.env.VERCEL_QUEUE_BASE_URL),
  deploymentId: null,
});

export default async function handler(req, res) {
  const taskId = randomUUID();
  const { messageId } = await send('cache-demo', { taskId });
  res.status(200).json({ taskId, messageId });
}
