/* global Response */

const baseUrl = ({ headers }) =>
  `${headers.get('x-forwarded-proto')}://${headers.get('x-forwarded-host')}`;

export function GET(request) {
  const { searchParams } = new URL(request.url, baseUrl(request));
  const name = searchParams.get('name');
  return new Response(`Greetings, ${name}`);
}
