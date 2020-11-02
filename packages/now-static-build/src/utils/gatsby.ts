import { PackageJson } from '@vercel/build-utils';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  fileExists,
  readPackageJson,
  DeepWriteable,
  writePackageJson,
} from './_shared';

const defaultConfig = {
  plugins: [
    {
      resolve: 'gatsby-plugin-vercel',
      options: {},
    },
  ],
};

export async function injectVercelAnalyticsPlugin(dir: string) {
  // Gatsby requires a special variable name for environment variables to be
  // exposed to the client-side JavaScript bundles:
  process.env.GATSBY_VERCEL_ANALYTICS_ID = process.env.VERCEL_ANALYTICS_ID;

  const gatsbyConfigName = 'gatsby-config.js';
  const gatsbyPluginPackageName = 'gatsby-plugin-vercel';

  const gatsbyConfigPath = path.join(dir, gatsbyConfigName);

  const pkgJson: DeepWriteable<PackageJson> = (await readPackageJson(
    dir
  )) as DeepWriteable<PackageJson>;
  if (!pkgJson.dependencies) {
    pkgJson.dependencies = {};
  }
  if (!pkgJson.dependencies[gatsbyPluginPackageName]) {
    pkgJson.dependencies[gatsbyPluginPackageName] = 'latest';

    await writePackageJson(dir, pkgJson);
  }

  if (await fileExists(gatsbyConfigPath)) {
    await fs.rename(
      gatsbyConfigPath,
      gatsbyConfigPath + '.__vercel_builder_backup__.js'
    );

    await fs.writeFile(
      gatsbyConfigPath,
      `const userConfig = require("./gatsby-config.js.__vercel_builder_backup__.js");

const vercelConfig = Object.assign({}, userConfig);
if (!vercelConfig.plugins) {
  vercelConfig.plugins = [];
}

const hasPlugin = vercelConfig.plugins.find(
  (p) =>
    p && (p === "gatsby-plugin-vercel" || p.resolve === "gatsby-plugin-vercel")
);
if (!hasPlugin) {
  vercelConfig.plugins = vercelConfig.plugins.slice();
  vercelConfig.plugins.push({
    resolve: "gatsby-plugin-vercel",
    options: {},
  });
}

module.exports = vercelConfig;
`
    );
  } else {
    await fs.writeFile(
      gatsbyConfigPath,
      `module.exports = ${JSON.stringify(defaultConfig)}`
    );
  }
}
