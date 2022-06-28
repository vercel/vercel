export const config = {
  runtime: 'experimental-edge',
};

export default async function edge(request, event) {
  const rootUrl = 'https://' + request.headers.get('host');
  const url = `${rootUrl}/static/next.svg`;
  return fetch(url);
}
