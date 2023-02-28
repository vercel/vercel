import { join } from 'path';
import os from 'os';

import type { GraphQLEngine, PageSSRHelpers } from '../types/gatsby-types';

type ExportsGraphQLEngine = {
  GraphQLEngine: GraphQLEngine;
};

const TMP_DATA_PATH = join(os.tmpdir(), 'data/datastore');

export async function getGraphQLEngine() {
  const { GraphQLEngine } = (await import(
    join(__dirname, '.cache/query-engine/index.js')
  )) as ExportsGraphQLEngine;

  // TODO: not sure why this throws an error about not being a constructor
  // TODO: when I can navigate to this type and see the `constructor` of the class
  return new GraphQLEngine({ dbPath: TMP_DATA_PATH });
}

export async function getPageSSRHelpers() {
  return (await import(
    join(__dirname, '.cache/page-ssr/index.js')
  )) as PageSSRHelpers;
}
