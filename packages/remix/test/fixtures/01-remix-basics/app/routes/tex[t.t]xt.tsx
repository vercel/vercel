import { LoaderFunction } from '@remix-run/node';

export const loader: LoaderFunction = ({ request }) => {
  return new Response(`this is a text file served at: ${request.url}`, {
    headers: { 'content-type': 'text/plain' },
  });
};
