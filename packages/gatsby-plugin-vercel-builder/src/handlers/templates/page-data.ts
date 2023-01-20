import os from 'os';
import etag from 'etag';
import { copySync, existsSync } from 'fs-extra';
import { join, dirname, basename } from 'path';
import { getGraphQLEngine, getPageSSRHelpers } from '../utils';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const TMP_DATA_PATH = join(os.tmpdir(), 'data/datastore');
const CUR_DATA_PATH = join(__dirname, '.cache/data/datastore');

if (!existsSync(TMP_DATA_PATH)) {
  // Copies executable `data` files to the writable /tmp directory.
  copySync(CUR_DATA_PATH, TMP_DATA_PATH);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const splitPathName = basename(dirname(req.url!));
  const pathName = splitPathName === `index` ? `/` : splitPathName;
  console.log({ url: req.url, splitPathName, pathName });

  const graphqlEngine = await getGraphQLEngine();
  const { getData, renderPageData } = await getPageSSRHelpers();

  const data = await getData({
    pathName,
    graphqlEngine,
    req,
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
