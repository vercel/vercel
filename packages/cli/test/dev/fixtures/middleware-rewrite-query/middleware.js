export default () =>
  new Response(null, {
    headers: {
      'x-middleware-rewrite': '/api/fn?from-middleware=true',
    },
  });
