import type { IncomingMessage, ServerResponse } from 'node:http';

export default function (req: IncomingMessage, res: ServerResponse) {
  res.end('ok');
}
