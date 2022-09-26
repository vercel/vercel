export const config = {
  runtime: 'experimental-edge',
};

export default async function edge(request, event) {
  const host = request.headers.get('x-forwarded-host');
  const proto = request.headers.get('x-forwarded-proto');
  const rootUrl = `${proto}://${host}`;
  const url = `${rootUrl}/static/next.svg`;

  return fetch(url);
}
