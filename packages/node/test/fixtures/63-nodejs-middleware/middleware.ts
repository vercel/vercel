export const config = {
  runtime: 'nodejs'
};

export default function middleware(req: Request) {
  const url = new URL(req.url);
  const headers = new Headers({
    'x-got-middleware': 'true',
  });
  if (url.pathname === '/' || url.pathname.startsWith('/api/')) {
    headers.set('x-middleware-next', '1');
    return new Response(null, { headers });
  } else {
    return new Response(`RANDOMNESS_PLACEHOLDER:middleware`, { headers });
  }
}
