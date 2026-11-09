import { getCache } from '@vercel/functions';

// Reads the completion the external Python worker wrote into Runtime Cache.
// Both processes talk to the `vc dev` shared store, so a write from the
// separately launched worker is visible here.
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
