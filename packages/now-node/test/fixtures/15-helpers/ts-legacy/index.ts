import { NowRequest, NowResponse } from './types';

export default function listener(req: NowRequest, res: NowResponse) {
  res.status(200);
  res.send('hello legacy:RANDOMNESS_PLACEHOLDER');
}
