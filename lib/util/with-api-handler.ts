import { NextApiRequest, NextApiResponse } from 'next';

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<any>;

export function withApiHandler(handler: Handler): Handler {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Cache-Control', 's-maxage=10,stale-while-revalidate');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Accept, Content-Type'
    );

    if (req.method === 'OPTIONS') {
      return res.status(200).json({});
    }

    return handler(req, res);
  };
}
