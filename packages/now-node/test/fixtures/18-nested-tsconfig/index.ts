import { NowRequest, NowResponse } from '@now/node';

export default function(req: NowRequest, res: NowResponse) {
  if (req) {
    res.end('root:RANDOMNESS_PLACEHOLDER');
  } else {
    res.end('no req found');
  }
}
