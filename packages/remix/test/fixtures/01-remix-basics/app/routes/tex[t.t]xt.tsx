import { LoaderFunction } from '@remix-run/node';

export const loader: LoaderFunction = ({ request }) => {
  const { pathname } = new URL(request.url);
  return new Response(`this is a text file served at: ${pathname}`, {
    headers: { 'content-type': 'text/plain' },
  });
};
