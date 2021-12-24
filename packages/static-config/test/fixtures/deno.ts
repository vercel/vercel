import ms from 'https://denopkg.com/TooTallNate/ms';
import { readerFromStreamReader } from 'https://deno.land/std@0.107.0/io/streams.ts';

export const config = {
  use: 'deno',
  location: 'https://example.com/page',
};

export default async ({ request }: Deno.RequestEvent) => {
  return new Response('Hello from Deno');
};
