import { VercelRequest, VercelResponse } from '@vercel/node';
import _frameworks, { Framework } from '../packages/frameworks';
import { withApiHandler } from './_lib/util/with-api-handler';

function getFrameworks(includeExperimental: boolean) {
  return (_frameworks as Framework[])
    .filter(f => includeExperimental || !f.experimental)
    .sort(
      (a, b) =>
        (a.sort || Number.MAX_SAFE_INTEGER) -
        (b.sort || Number.MAX_SAFE_INTEGER)
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
}

export default withApiHandler(
  async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Accept, Content-Type'
    );

    const includeExperimental = req.query.includeExperimental === 'true';
    const frameworks = getFrameworks(includeExperimental);

    return res.status(200).json(frameworks);
  }
);
