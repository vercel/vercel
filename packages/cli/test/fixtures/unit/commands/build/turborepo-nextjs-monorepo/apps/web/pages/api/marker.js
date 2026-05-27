console.log('VERCEL_TEST_MARKER:turborepo-nextjs-monorepo');

export default function handler(_req, res) {
  res.status(200).json({ ok: true });
}
