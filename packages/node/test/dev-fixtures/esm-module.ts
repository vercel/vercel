import type { VercelRequest, VercelResponse } from '../..';

export default (_req: VercelRequest, res: VercelResponse) => {
  res.setHeader('x-hello', 'world');
  res.send('Hello, world!').end();
};
