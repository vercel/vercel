import { extract } from '../_lib/examples/extract';
import { summary } from '../_lib/examples/summary';
import { NowRequest, NowResponse } from '@vercel/node';
import { mapOldToNew } from '../_lib/examples/map-old-to-new';
import { withApiHandler } from '../_lib/util/with-api-handler';

export default withApiHandler(async function (
  req: NowRequest,
  res: NowResponse
) {
  await extract('https://github.com/vercel/vercel/archive/master.zip', '/tmp');
  const exampleList = summary('/tmp/vercel-master/examples');

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
