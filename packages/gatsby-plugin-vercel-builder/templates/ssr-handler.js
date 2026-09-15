import etag from 'etag';
import { join } from 'path';
import { copySync, existsSync } from 'fs-extra';
import { getPageName, redirectGatsbyCachesToWritableDir } from './utils';

// Point Gatsby's writable cache locations at the OS temp dir BEFORE the query
// engine is imported below (it resolves its LMDB cache path at module load).
// See `redirectGatsbyCachesToWritableDir` in ./utils for the full rationale.
const TMP_DIR = redirectGatsbyCachesToWritableDir();

const TMP_DATA_PATH = join(TMP_DIR, 'data/datastore');
const CUR_DATA_PATH = join(__dirname, '.cache/data/datastore');

if (!existsSync(TMP_DATA_PATH)) {
  // Copies executable `data` files to the writable /tmp directory.
  copySync(CUR_DATA_PATH, TMP_DATA_PATH);
}

// Seed the writable cache dir with caches produced at build time so warm
// resolver caches still hit at runtime (mirrors the datastore copy above).
const TMP_CACHES_PATH = join(TMP_DIR, '.cache/caches');
const CUR_CACHES_PATH = join(__dirname, '.cache/caches');

if (!existsSync(TMP_CACHES_PATH) && existsSync(CUR_CACHES_PATH)) {
  copySync(CUR_CACHES_PATH, TMP_CACHES_PATH);
}

async function getGraphQLEngine() {
  const { GraphQLEngine } = await import(
    join(__dirname, '.cache/query-engine/index.js')
  );

  return new GraphQLEngine({ dbPath: TMP_DATA_PATH });
}

async function getPageSSRHelpers() {
  return await import(join(__dirname, '.cache/page-ssr/index.js'));
}

export default async function handler(req, res) {
  // eslint-disable-next-line no-undef
  const { pathName, isPageData } = getPageName(req.url, vercel_pathPrefix);

  const [graphqlEngine, { getData, renderHTML, renderPageData }] =
    await Promise.all([getGraphQLEngine(), getPageSSRHelpers()]);

  const data = await getData({
    pathName,
    graphqlEngine,
    req,
  });

  const results = isPageData
    ? await renderPageData({ data })
    : await renderHTML({ data });

  if (data.serverDataHeaders) {
    for (const [name, value] of Object.entries(data.serverDataHeaders)) {
      res.setHeader(name, value);
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
