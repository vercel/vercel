import { extract } from '../_lib/examples/extract';
import { summary } from '../_lib/examples/summary';
import { NowRequest, NowResponse } from '@now/node';
import { mapOldToNew } from '../_lib/examples/map-old-to-new';
import { withApiHandler } from '../_lib/util/with-api-handler';

export default withApiHandler(async function(
  req: NowRequest,
  res: NowResponse
) {
  if (Number(req.query.version) === 1) {
    // The old cli is pinned to a specific commit hash
    await extract(
      'https://github.com/zeit/now-examples/archive/7c7b27e49b8b17d0d3f0e1604dc74fd005cd69e3.zip',
      '/tmp'
    );
    const exampleList = summary(
      '/tmp/now-examples-7c7b27e49b8b17d0d3f0e1604dc74fd005cd69e3'
    );
    return res.send(exampleList);
  }

  await extract('https://github.com/zeit/now/archive/master.zip', '/tmp');
  const exampleList = summary('/tmp/now-master/examples');

  const existingExamples = Array.from(exampleList).map(key => ({
    name: key,
    visible: true,
    suggestions: [],
  }));

  const oldExamples = Object.keys(mapOldToNew).map(key => ({
    name: key,
    visible: false,
    suggestions: mapOldToNew[key],
  }));

  res.status(200).json([...existingExamples, ...oldExamples]);
});
