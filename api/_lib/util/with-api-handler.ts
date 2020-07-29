import { NowRequest, NowResponse } from '@vercel/node';
import { errorHandler } from './error-handler';

type Handler = (req: NowRequest, res: NowResponse) => Promise<any>;

export function withApiHandler(handler: Handler): Handler {
  return async (req: NowRequest, res: NowResponse) => {
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
      return res.status(405).json({
        error: {
          code: 'method_not_allowed',
          message: 'Only GET requests are supported for this endpoint.',
        },
      });
    }

    try {
      const result = await handler(req, res);
      return result;
    } catch (error) {
      errorHandler(error, {
        url: req.url,
      });

      return res.status(500).json({
        error: {
          code: 'unexpected_error',
          message: 'An unexpected error occurred.',
        },
      });
    }
  };
}
