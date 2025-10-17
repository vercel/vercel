export const dynamic = 'force-dynamic';

// This route is opted into the Bun runtime via `vercel.json`
export async function GET() {
  const runtime = typeof (globalThis as any).Bun !== 'undefined' ? 'bun' : 'node';
  return new Response(JSON.stringify({ runtime: runtime }));
}
