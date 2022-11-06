export const config = {
  runtime: 'experimental-edge',
};

export default async function edge(request: Request, event: Event) {
  if (request.url.indexOf('/index.html') > -1) {
    return new Response(null, {
      headers: {
        'x-middleware-rewrite': '/does-not-exist.html',
      },
    });
  }

  if (request.url.indexOf('/api/edge') > -1) {
    return new Response(null, {
      headers: {
        'x-middleware-rewrite': '/api/does-not-exist',
      },
    });
  }
}
