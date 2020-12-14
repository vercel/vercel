import { VercelRequest, VercelResponse } from '@now/node';
import { hello } from './dep';

export default function (req: VercelRequest, res: VercelResponse) {
  if (req) {
    res.end(hello.toString());
  } else {
    res.end('no req found');
  }
}
