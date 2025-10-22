// This route is not opted into the Bun runtime
export default function handler(req, res) {
  const runtime = typeof globalThis.Bun !== 'undefined' ? 'bun' : 'node';
  res.status(200).json({ runtime });
}
