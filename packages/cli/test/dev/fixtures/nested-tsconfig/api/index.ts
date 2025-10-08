import { IncomingMessage, ServerResponse } from 'http';

export default function(req: IncomingMessage, res: ServerResponse) {
  res.end('Nested `tsconfig.json` API endpoint');
}
