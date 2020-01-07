import { NextApiRequest, NextApiResponse } from 'next';
import frameworkList, { Framework } from '@now/frameworks';
import { withApiHandler } from '../../lib/util/with-api-handler';

const frameworks: Framework[] = frameworkList as Framework[];

frameworks.forEach(framework => {
  if (framework.logo) {
    framework.logo = `https://res.cloudinary.com/zeit-inc/image/fetch/${framework.logo}`;
  }
});

export default withApiHandler(async function(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Accept, Content-Type'
  );

  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  return res.status(200).json(frameworks);
});
