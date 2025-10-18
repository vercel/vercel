// This route is opted into the Bun runtime via `vercel.json`
export default function handler(req, res) {
  const runtime = typeof globalThis.Bun !== 'undefined' ? 'bun' : 'node';
  res.status(200).json({ runtime });
}
