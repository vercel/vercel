import { NowRequest, NowResponse } from '@vercel/node';
import { getExampleList } from '../_lib/examples/example-list';
import { withApiHandler } from '../_lib/util/with-api-handler';

export default withApiHandler(async function (
  req: NowRequest,
  res: NowResponse
) {
  res.status(200).json(await getExampleList());
});
