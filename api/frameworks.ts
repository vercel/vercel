import { VercelRequest, VercelResponse } from '@vercel/node';
import { withApiHandler } from './_lib/util/with-api-handler';
import _frameworks, { Framework } from '../packages/frameworks';

const frameworks = (_frameworks as Framework[])
  .sort(
    (a, b) =>
      (a.sort || Number.MAX_SAFE_INTEGER) - (b.sort || Number.MAX_SAFE_INTEGER)
  )
  .map(frameworkItem => {
    const framework = {
      ...frameworkItem,
      detectors: undefined,
      sort: undefined,
      dependency: undefined,
      defaultRoutes: undefined,
    };

    return framework;
  });

export default withApiHandler(async function (
  req: VercelRequest,
  res: VercelResponse
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Accept, Content-Type'
  );
  return res.status(200).json(frameworks);
});
