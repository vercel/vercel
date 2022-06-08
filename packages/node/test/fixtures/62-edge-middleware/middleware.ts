export default (req: Request) => {
  const url = new URL(req.url);
  if (url.pathname === '/' || url.pathname.startsWith('/api/')) {
    // For `index.html` and `/api/edge.js`, pass through
    const response = new Response();
    response.headers.set('x-middleware-next', '1');
    return response;
  } else {
    // For everything else, serve a custom response
    return new Response(`RANDOMNESS_PLACEHOLDER:middleware`);
  }
};
