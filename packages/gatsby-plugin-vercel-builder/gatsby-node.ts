// this gets built separately, so import from "dist" instead of "src"
import { generateVercelBuildOutputAPI3Output } from './dist';

export const onPostBuild = async ({ store }: { store: any }) => {
  await generateVercelBuildOutputAPI3Output({
    // validated by `pluginOptionSchema`
    gatsbyStoreState: store.getState(),
  });
};
