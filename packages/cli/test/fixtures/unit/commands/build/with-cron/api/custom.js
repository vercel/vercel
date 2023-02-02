export const config = {
  runtime: 'edge',
  cron: {
    expression: '* * * * *',
    path: '/api/custom',
  },
};

export default async function edge(request, event) {
  const requestBody = await request.text();

  return new Response(
    JSON.stringify({
      headerContentType: request.headers.get('content-type'),
      url: request.url,
      method: request.method,
      body: requestBody,
    })
  );
}
