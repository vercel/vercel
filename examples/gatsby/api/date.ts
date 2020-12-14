import { NowRequest, NowResponse } from '@vercel/node';

export default (_req: NowRequest, res: NowResponse) => {
  const date = new Date().toString();
  res.status(200).send(date);
};
