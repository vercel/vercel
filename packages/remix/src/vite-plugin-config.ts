import { Project } from 'ts-morph';
import { getConfig, BaseFunctionConfig } from '@vercel/static-config';

// export at top-level / outside of `dist`?
import type { RemixVitePluginOptions } from '@remix-run/dev/dist/vite/plugin';

// export `BranchRoute` type?
type BranchRoute = Parameters<
  NonNullable<RemixVitePluginOptions['unstable_serverBundles']>
>[0]['branch'][number];

const project = new Project();
const configCache = new Map<string, BaseFunctionConfig>();

function getRouteConfig(
  branch: BranchRoute[],
  index = branch.length - 1
): BaseFunctionConfig {
  const route = branch[index];
  let config = configCache.get(route.file);
  if (!config) {
    //console.log('Parsing config: %j', route.file);
    config = getConfig(project, route.file) || {};
    configCache.set(route.file, config);
  }

  if (index > 0) {
    Object.setPrototypeOf(config, getRouteConfig(branch, index - 1));
  }
  return config;
}

function calculateRouteHash(config: BaseFunctionConfig) {
  return config.runtime || 'nodejs';
}

const config: RemixVitePluginOptions = {
  unstable_serverBundles: args => {
    const config = getRouteConfig(args.branch);
    const hash = calculateRouteHash(config);
    return hash;
  },
};

export default config;
