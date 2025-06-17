export default function middleware(req: Request) {
  const headers = new Headers({
    'x-got-middleware': 'true',
  });
  if (req.url === '/' || req.url.startsWith('/api/')) {
    headers.set('x-middleware-next', '1');
    return new Response(null, { headers });
  } else {
    return new Response(`RANDOMNESS_PLACEHOLDER:middleware`, { headers });
  }
}
