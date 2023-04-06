import os from 'os';
import etag from 'etag';
import { parse } from 'url';
import { copySync, existsSync } from 'fs-extra';
import { join, dirname, basename } from 'path';
import { getPageSSRHelpers, getGraphQLEngine } from '../utils';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const TMP_DATA_PATH = join(os.tmpdir(), 'data/datastore');
const CUR_DATA_PATH = join(__dirname, '.cache/data/datastore');

if (!existsSync(TMP_DATA_PATH)) {
  // Copies executable `data` files to the writable /tmp directory.
  copySync(CUR_DATA_PATH, TMP_DATA_PATH);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  let pageName: string;
  const pathname = parse(req.url!).pathname || '/';
  const isPageData = pathname.startsWith('/page-data/');
  if (isPageData) {
    // /page-data/index/page-data.json
    // /page-data/using-ssr/page-data.json
    pageName = basename(dirname(pathname));
    if (pageName === 'index') {
      pageName = '/';
    }
  } else {
    // /using-ssr
    // /using-ssr/
    // /using-ssr/index.html
    pageName = basename(pathname);
    if (pageName === 'index.html') {
      pageName = basename(dirname(pathname));
    }
    if (!pageName) {
      pageName = '/';
    }
  }

  const [graphqlEngine, { getData, renderHTML, renderPageData }] =
    await Promise.all([getGraphQLEngine(), getPageSSRHelpers()]);

  const data = await getData({
    pathName: pageName,
    graphqlEngine,
    req,
  });

  const results = isPageData
    ? await renderPageData({ data })
    : await renderHTML({ data });

  if (data.serverDataHeaders) {
    for (const [name, value] of Object.entries(data.serverDataHeaders)) {
      res.setHeader(name, value as string);
    }
  }

  if (data.serverDataStatus) {
    res.statusCode = data.serverDataStatus;
  }

  if (isPageData) {
    res.setHeader('ETag', etag(JSON.stringify(results)));
    res.json(results);
  } else {
    res.send(results);
  }
}
