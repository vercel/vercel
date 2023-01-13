import path from 'path';

import type { GatsbyNode } from 'gatsby';

import { generateVercelBuildOutputAPI3Output } from './build';

export const pluginOptionsSchema: GatsbyNode['pluginOptionsSchema'] = ({
  Joi,
}) => {
  return Joi.object({
    exportPath: Joi.string().optional(),
  });
};

export const onPostBuild: GatsbyNode['onPostBuild'] = async (
  { store },
  pluginOptions
) => {
  // validated by `pluginOptionSchema`
  const exportPath = (pluginOptions?.exportPath ??
    path.join('.vercel', 'output', 'config.json')) as string;

  await generateVercelBuildOutputAPI3Output({
    exportPath,
    gatsbyStoreState: store.getState(),
  });
};
