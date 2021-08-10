import { IncomingMessage, ServerResponse } from 'http';
export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (req && !req.thisDoesNotExist) {
    res.end('no-emit-on-error-true:RANDOMNESS_PLACEHOLDER');
  }
}
