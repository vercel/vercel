import type { IncomingMessage, ServerResponse } from 'http';

export default async function handler(
  _request: IncomingMessage,
  response: ServerResponse
) {
  const res = await fetch('https://example.vercel.sh');
  const text = await res.text();
  return response.end(text);
}
