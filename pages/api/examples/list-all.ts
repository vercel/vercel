import { NextApiRequest, NextApiResponse } from 'next';
import { getExampleList } from '../../../lib/examples/example-list';
import { withApiHandler } from '../../../lib/util/with-api-handler';

export default withApiHandler(async function(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.status(200).json(await getExampleList());
});
