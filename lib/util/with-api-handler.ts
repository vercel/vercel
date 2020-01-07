import { NextApiRequest, NextApiResponse } from 'next';

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<any>;

export function withApiHandler(handler: Handler): Handler {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Accept, Content-Type'
    );

    if (req.method === 'OPTIONS') {
      return res.status(200).json({});
    }

    if (req.method !== 'GET') {
      return res.status(404).json({
        error: {
          code: 'not_found',
          message: 'Only GET requests are supported for this endpoint.',
        },
      });
    }

    return handler(req, res);
  };
}
