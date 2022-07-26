export default (req: Request) => {
  const url = new URL(req.url);
  const headers = new Headers({
    'x-got-middleware': 'true',
  });
  if (url.pathname === '/' || url.pathname.startsWith('/api/')) {
    // For `index.html` and `/api/edge.js`, pass through
    headers.set('x-middleware-next', '1');
    return new Response(null, { headers });
  } else {
    // For everything else, serve a custom response
    return new Response(`RANDOMNESS_PLACEHOLDER:middleware`, { headers });
  }
};
