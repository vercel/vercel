import os from 'os';
import { join } from 'path';
import etag from 'etag';
import { copySync, existsSync, readFileSync } from 'fs-extra';

import type { VercelRequest, VercelResponse } from '@vercel/node';

import { getGraphQLEngine, getPageSSRHelpers } from '../utils';

const TMP_DATA_PATH = join(os.tmpdir(), 'data/datastore');
const CUR_DATA_PATH = join(__dirname, '.cache/data/datastore');

if (!existsSync(TMP_DATA_PATH)) {
  // Copies executable `data` files to the writable /tmp directory.
  copySync(CUR_DATA_PATH, TMP_DATA_PATH);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const splitPathName = req.url!.split('/')[2];
  const pathName = splitPathName === `index` ? `/` : splitPathName;

  if (
    existsSync(join(__dirname, 'page-data', splitPathName, 'page-data.json'))
  ) {
    /* Non-SSR/DSG pages already have a pre-generated page-data.json file.
      Instead of generating this dynamically, we can directly serve this JSON. */
    res.setHeader('Content-Type', 'application/json');

    return res
      .status(200)
      .json(
        readFileSync(
          join(__dirname, 'page-data', splitPathName, 'page-data.json'),
          'utf-8'
        )
      );
  }

  const { getData, renderPageData } = await getPageSSRHelpers();
  const graphqlEngine = await getGraphQLEngine();

  const data = await getData({
    req,
    graphqlEngine,
    pathName,
  });

  const pageData = await renderPageData({ data });

  if (data.serverDataHeaders) {
    for (const [name, value] of Object.entries(data.serverDataHeaders)) {
      res.setHeader(name, value);
    }
  }

  res.setHeader('ETag', etag(JSON.stringify(pageData)));
  return res.json(pageData);
}
