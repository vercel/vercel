export const dynamic = 'force-dynamic';

// This route is not opted into the Bun runtime
export async function GET() {
  const runtime = typeof globalThis.Bun !== 'undefined' ? 'bun' : 'node';
  return new Response(JSON.stringify({ runtime: runtime }));
}
