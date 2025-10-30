export const config = {
  runtime: 'nodejs',
};

export default (req: Request) => {
  const url = new URL(req.url);
  const headers = new Headers({
    'x-got-middleware': 'true',
  });
  if (url.pathname.startsWith('/api/')) {
    // For `/api/*`, pass through
    headers.set('x-middleware-next', '1');
    return new Response(null, { headers });
  } else {
    // For everything else, serve a custom response
    const runtime = typeof (globalThis as any).Bun !== 'undefined' ? 'bun' : 'node';
    return new Response(`RANDOMNESS_PLACEHOLDER:middleware:${runtime}`, { headers });
  }
};
