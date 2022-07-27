import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import etag from 'etag';

import { getGraphQLEngine, getPageSSRHelpers } from '../utils';
import type {
  ServerlessFunctionRequest,
  ServerlessFunctionResponse,
} from '../../types';

export default async function handler(
  req: ServerlessFunctionRequest,
  res: ServerlessFunctionResponse
) {
  const splitPathName = (req.url as string).split('/')[2];
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

  try {
    const data = await getData({
      req,
      graphqlEngine,
      pathName,
    });

    const body = JSON.stringify(await renderPageData({ data }));

    if (data.serverDataHeaders) {
      for (const [name, value] of Object.entries(data.serverDataHeaders)) {
        res.setHeader(name, value);
      }
    }

    res.setHeader('ETag', etag(body));
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(body);
  } catch (e) {
    console.error(e);
    return res.status(500).send('Internal server error.');
  }
}
