export default () => {
  return new Response(null, {
    headers: {
      'x-middleware-next': '1',
      'x-middleware-override-headers':
        'x-from-client-a,x-from-client-b,x-from-middleware-a,x-from-middleware-b,transfer-encoding',
      // Headers to be preserved.
      'x-middleware-request-x-from-client-a': 'hello from client',
      // Headers to be modified by the middleware.
      'x-middleware-request-x-from-client-b': 'hello from middleware',
      // Headers to be added by the middleware.
      'x-middleware-request-x-from-middleware-a': 'hello a!',
      'x-middleware-request-x-from-middleware-b': 'hello b!',
      // Headers not allowed by the dev server: will be ignored.
      'transfer-encoding': 'gzip, chunked',
    },
  });
};
