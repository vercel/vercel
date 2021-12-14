import { IncomingMessage, ServerResponse } from 'http';
import { hello } from '../dep';

export default function (req: IncomingMessage, res: ServerResponse) {
  if (req) {
    res.end(hello.toString());
  } else {
    res.end('no req found');
  }
}
