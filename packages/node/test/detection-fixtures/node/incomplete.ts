import type { IncomingMessage } from 'node:http';

export default function (req: IncomingMessage) {
  console.log(req.url);
}
