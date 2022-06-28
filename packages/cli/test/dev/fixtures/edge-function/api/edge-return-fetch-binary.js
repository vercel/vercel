export const config = {
  runtime: 'experimental-edge',
};

export default async function edge(request, event) {
  const rootUrl = 'https://' + request.headers.get('host');
  const url = `${rootUrl}/static/bunny.mp4`;

  console.log('fetching: ', url);

  return fetch(url);
}
