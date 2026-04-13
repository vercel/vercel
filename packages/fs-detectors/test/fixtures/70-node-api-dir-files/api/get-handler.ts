export function GET(request: Request): Response {
  return new Response(JSON.stringify({ ok: true }));
}
