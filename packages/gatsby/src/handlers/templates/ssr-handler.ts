import { join } from 'path';
import os from 'os';
import { copySync, existsSync } from 'fs-extra';

import { getPageSSRHelpers, getGraphQLEngine } from '../utils';
import type {
  ServerlessFunctionRequest,
  ServerlessFunctionResponse,
} from '../../types';

const TMP_DATA_PATH = join(os.tmpdir(), 'data/datastore');
const CUR_DATA_PATH = join(__dirname, '.cache/data/datastore');

if (!existsSync(TMP_DATA_PATH)) {
  // Copies executable `data` files to the writable /tmp directory.
  copySync(CUR_DATA_PATH, TMP_DATA_PATH);
}

export default async function handler(
  req: ServerlessFunctionRequest,
  res: ServerlessFunctionResponse
) {
  try {
    const graphqlEngine = await getGraphQLEngine();
    const { getData, renderHTML } = await getPageSSRHelpers();

    const data = await getData({
      pathName: req.url as string,
      graphqlEngine,
      req,
    });

    const results = await renderHTML({ data });

    if (data.serverDataHeaders) {
      for (const [name, value] of Object.entries(data.serverDataHeaders)) {
        res.setHeader(name, value);
      }
    }

    if (data.serverDataStatus) {
      return res.status(data.serverDataStatus).send(results);
    } else {
      return res.status(200).send(results);
    }
  } catch (e) {
    console.log(e);
    throw e;
  }
}
