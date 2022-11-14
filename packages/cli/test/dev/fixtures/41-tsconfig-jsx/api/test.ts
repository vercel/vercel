import type { VercelApiHandler } from '@vercel/node';

const handler: VercelApiHandler = (req, res) => {
  res.send('working');
};

export default handler;
