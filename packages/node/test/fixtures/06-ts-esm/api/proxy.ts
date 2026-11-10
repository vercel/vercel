import nodeFetch from 'node-fetch';
import type { IncomingMessage, ServerResponse } from 'http';

export default async function handler(
  _request: IncomingMessage,
  response: ServerResponse
) {
  const res = await nodeFetch('https://example.vercel.sh');
  const text = await res.text();
  return response.end(text);
}
