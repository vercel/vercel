import type { NextApiRequest, NextApiResponse } from 'next';

// This route is opted into the Bun runtime via `vercel.json`
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const runtime = typeof (globalThis as any).Bun !== 'undefined' ? 'bun' : 'node';
  res.status(200).json({ runtime });
}
