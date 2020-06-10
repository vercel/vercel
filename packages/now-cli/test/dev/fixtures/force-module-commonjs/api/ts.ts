import { IncomingMessage, ServerResponse } from 'http';

export default function(req: IncomingMessage, res: ServerResponse) {
  res.end('Force "module: commonjs" TypeScript API endpoint');
}
