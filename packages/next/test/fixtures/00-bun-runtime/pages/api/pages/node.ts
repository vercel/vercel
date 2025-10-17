import type { NextApiRequest, NextApiResponse } from 'next';

// This route is not opted into the Bun runtime
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const runtime = typeof (globalThis as any).Bun !== 'undefined' ? 'bun' : 'node';
  res.status(200).json({ runtime });
}
