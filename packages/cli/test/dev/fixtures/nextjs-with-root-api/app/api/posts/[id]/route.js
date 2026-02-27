// App Router dynamic API route (CLI-152: must not 404 when root api/ exists)
export async function GET(request, { params }) {
  const resolved = typeof params.then === 'function' ? await params : params;
  return Response.json({ postId: resolved.id, source: 'app-router' });
}
