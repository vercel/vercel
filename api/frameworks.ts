import { NowRequest, NowResponse } from '@now/node';
import { withApiHandler } from './_lib/util/with-api-handler';
import frameworkList, { Framework } from '../packages/frameworks';

const frameworks = (frameworkList as Framework[]).map(frameworkItem => {
  const framework = {
    ...frameworkItem,
    detectors: undefined,
  };

  if (framework.logo) {
    framework.logo = `https://res.cloudinary.com/zeit-inc/image/fetch/${framework.logo}`;
  }

  return framework;
});

export default withApiHandler(async function(
  req: NowRequest,
  res: NowResponse
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Accept, Content-Type'
  );
  return res.status(200).json(frameworks);
});
