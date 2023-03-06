// this gets built separately, so import from "dist" instead of "src"
import { generateVercelBuildOutputAPI3Output } from './dist';

export const onPostBuild = async ({
  pathPrefix,
  store,
}: {
  pathPrefix: string;
  store: any;
}) => {
  await generateVercelBuildOutputAPI3Output({
    pathPrefix,
    // validated by `pluginOptionSchema`
    gatsbyStoreState: store.getState(),
  });
};
