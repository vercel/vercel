import { NowRequest, NowResponse } from '@now/node';
import { withApiHandler } from './_lib/util/with-api-handler';
import frameworkList, { Framework } from '../packages/frameworks';

const frameworks: Framework[] = (frameworkList as Framework[]).map(
  framework => {
    delete framework.detectors;

    if (framework.logo) {
      framework.logo = `https://res.cloudinary.com/zeit-inc/image/fetch/${framework.logo}`;
    }

    return framework;
  }
);

export default withApiHandler(async function(
  req: NowRequest,
  res: NowResponse
) {
  return res.status(200).json(frameworks);
});
