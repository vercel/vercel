import { getCache } from '@vercel/functions';

// Reads the completion the Python subscriber wrote into the Runtime Cache.
// In `vc dev` both processes talk to the dev server's shared store, so a
// write from the Python sidecar is visible here.
export default async function handler(req, res) {
  const taskId = String(req.query.taskId || '');
  const completion = await getCache({ namespace: 'queue-cache' }).get(
    `task:${taskId}`
  );
  res.status(200).json({
    taskId,
    status: completion ? 'completed' : 'pending',
    completion: completion ?? null,
  });
}
