import { NextApiRequest, NextApiResponse } from 'next';
import frameworkList, { Framework } from '@now/frameworks';
import { withApiHandler } from '../../lib/util/with-api-handler';

const frameworks: Framework[] = frameworkList.map(framework => {
  if (framework.logo) {
    framework.logo = `https://res.cloudinary.com/zeit-inc/image/fetch/${framework.logo}`;
  }

  return framework;
});

export default withApiHandler(async function(
  req: NextApiRequest,
  res: NextApiResponse
) {
  return res.status(200).json(frameworks);
});
