import os from 'os';
import { join } from 'path';

const TMP_DATA_PATH = join(os.tmpdir(), 'data/datastore');

export async function getGraphQLEngine() {
  const { GraphQLEngine } = (await import(
    join(__dirname, '.cache/query-engine/index.js')
  )) as typeof import('gatsby/dist/schema/graphql-engine/entry');

  return new GraphQLEngine({ dbPath: TMP_DATA_PATH });
}

export function getPageSSRHelpers(): Promise<
  typeof import('gatsby/dist/utils/page-ssr-module/entry')
> {
  return import(join(__dirname, '.cache/page-ssr/index.js'));
}
