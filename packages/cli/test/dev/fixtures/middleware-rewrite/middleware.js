export default req => {
  const url = new URL(req.url);

  const rewriteTo = url.searchParams.get('to');
  if (rewriteTo) {
    return new Response(null, {
      headers: {
        'x-middleware-rewrite': rewriteTo,
      },
    });
  }

  if (url.pathname === '/') {
    // Pass-through "index.html" page
    return new Response(null, {
      headers: {
        'x-middleware-next': '1',
      },
    });
  }

  // Everything else goes to "another.html"
  return new Response(null, {
    headers: {
      'x-middleware-rewrite': '/another.html',
    },
  });
};
