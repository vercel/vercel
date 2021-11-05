import { VercelRequest, VercelResponse } from './types';

export default function listener(req: VercelRequest, res: VercelResponse) {
  res.status(200);
  res.send('hello:RANDOMNESS_PLACEHOLDER');
}
