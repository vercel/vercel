import type { GatsbyNode } from 'gatsby';

// this gets built separately, so import from "dist" instead of "src"
import { generateVercelBuildOutputAPI3Output } from './dist';

export const onPostBuild: GatsbyNode['onPostBuild'] = async ({
  pathPrefix,
  store,
}) => {
  await generateVercelBuildOutputAPI3Output({
    pathPrefix,
    // validated by `pluginOptionSchema`
    gatsbyStoreState: store.getState(),
  });
};
