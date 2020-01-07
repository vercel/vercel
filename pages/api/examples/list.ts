import { NextApiRequest, NextApiResponse } from 'next';
import { extract } from '../../../lib/examples/extract';
import { summary } from '../../../lib/examples/summary';
import { mapOldToNew } from '../../../lib/examples/map-old-to-new';
import { withApiHandler } from '../../../lib/util/with-api-handler';

export default withApiHandler(async function(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const apiVersion = Number(req.query.version) || 1;

  if (Number.isNaN(apiVersion) || apiVersion > 2 || apiVersion < 1) {
    return res.status(400).json({
      error: {
        code: 'invalid_api_version',
        message: 'Invalid API Version.',
      },
    });
  }

  switch (apiVersion) {
    case 2: {
      await extract(
        'https://github.com/zeit/now-examples/archive/master.zip',
        '/tmp'
      );
      const exampleList = summary('/tmp/now-examples-master');

      const existingExamples = exampleList.map(key => ({
        name: key,
        visible: true,
        suggestions: [],
      }));

      const oldExamples = Object.keys(mapOldToNew).map(key => ({
        name: key,
        visible: false,
        suggestions: mapOldToNew[key],
      }));

      const allExamples = existingExamples.concat(oldExamples);
      res.send(allExamples);
      break;
    }
    default: {
      // The old cli is pinned to a specific commit hash
      await extract(
        'https://github.com/zeit/now-examples/archive/7c7b27e49b8b17d0d3f0e1604dc74fd005cd69e3.zip',
        '/tmp'
      );
      const exampleList = summary(
        '/tmp/now-examples-7c7b27e49b8b17d0d3f0e1604dc74fd005cd69e3'
      );
      res.send(exampleList);
    }
  }
});
