import type { IncomingMessage, ServerResponse } from 'http';

export default function handler(_req: IncomingMessage, res: ServerResponse) {
  res.end('typescript:RANDOMNESS_PLACEHOLDER');
}
