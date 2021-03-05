import { NowRequest, NowResponse } from '@now/node';
import { hello } from './dep';

export default function (req: NowRequest, res: NowResponse) {
  if (req) {
    res.end(hello.toString());
  } else {
    res.end('no req found');
  }
}
