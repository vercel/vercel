const baseUrl = ({ headers }) =>
  `${headers.get('x-forwarded-proto')}://${headers.get('x-forwarded-host')}`;

export function GET(request, ctx) {
  const { searchParams } = new URL(request.url, baseUrl(request));
  const url = searchParams.get('url');

  ctx.waitUntil(fetch(url));
  return Response.json({ keys: Object.keys(ctx) });
}

export const config = { runtime: 'edge' };
