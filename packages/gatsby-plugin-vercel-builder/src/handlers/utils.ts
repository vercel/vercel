import { join } from 'path';
import os from 'os';

const TMP_DATA_PATH = join(os.tmpdir(), 'data/datastore');

export async function getGraphQLEngine() {
  const { GraphQLEngine } = (await import(
    join(__dirname, '.cache/query-engine/index.js')
  )) as typeof import('gatsby/dist/schema/graphql-engine/entry');

  return new GraphQLEngine({ dbPath: TMP_DATA_PATH });
}

export async function getPageSSRHelpers() {
  return (await import(
    join(__dirname, '.cache/page-ssr/index.js')
  )) as typeof import('gatsby/dist/utils/page-ssr-module/entry');
}
