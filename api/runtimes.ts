import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withApiHandler } from './_lib/util/with-api-handler';
import { runtimeList } from '../packages/frameworks';

const runtimes = runtimeList
  .slice()
  .sort(
    (a, b) =>
      (a.sort || Number.MAX_SAFE_INTEGER) - (b.sort || Number.MAX_SAFE_INTEGER)
  )
  .map(runtimeItem => {
    const runtime = {
      ...runtimeItem,
      detectors: undefined,
      sort: undefined,
      defaultRoutes: undefined,
    };

    return runtime;
  });

export default withApiHandler(async function (
  _req: VercelRequest,
  res: VercelResponse
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Accept, Content-Type'
  );
  return res.status(200).json(runtimes);
});
