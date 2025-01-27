import { waitUntil } from '@vercel/functions';

const baseUrl = ({ headers }) =>
  `${headers.get('x-forwarded-proto')}://${headers.get('x-forwarded-host')}`;

export function GET(request) {
  const { searchParams } = new URL(request.url, baseUrl(request));
  const url = searchParams.get('url');
  waitUntil(fetch(url));
  return new Response('OK');
}
