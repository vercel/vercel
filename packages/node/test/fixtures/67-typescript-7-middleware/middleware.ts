import { responseBody } from './response.ts';

export default function middleware(_request: Request) {
  return new Response(responseBody, {
    headers: {
      'x-typescript-version': '7',
    },
  });
}
