import type { VercelRequest, VercelResponse } from '../..';

export default (_req: VercelRequest, res: VercelResponse) => {
  res.setHeader('Set-Cookie', ['a=x', 'b=y', 'c=z']);
  res.send('Hello, world!').end();
};
