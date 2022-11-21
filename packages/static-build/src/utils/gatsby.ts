import { PackageJson } from '@vercel/build-utils';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  fileExists,
  readPackageJson,
  DeepWriteable,
  writePackageJson,
} from './_shared';

const DEFAULT_CONFIG = {
  plugins: [
    {
      resolve: 'gatsby-plugin-vercel',
      options: {},
    },
  ],
};
const GATSBY_PLUGIN_PACKAGE_NAME = 'gatsby-plugin-vercel';
const GATSBY_CONFIG_FILE = 'gatsby-config';

export async function injectVercelAnalyticsPlugin(dir: string): Promise<void> {
  // Gatsby requires a special variable name for environment variables to be
  // exposed to the client-side JavaScript bundles:
  process.env.GATSBY_VERCEL_ANALYTICS_ID = process.env.VERCEL_ANALYTICS_ID;

  const gatsbyConfigPathJs = path.join(dir, `${GATSBY_CONFIG_FILE}.js`);
  const gatsbyConfigPathTs = path.join(dir, `${GATSBY_CONFIG_FILE}.ts`);
  if (await fileExists(gatsbyConfigPathTs)) {
    console.log(
      `Injecting Gatsby.js analytics plugin "${GATSBY_PLUGIN_PACKAGE_NAME}" to \`${gatsbyConfigPathTs}\``
    );
    await addGatsbyPackage(dir);
    return updateGatsbyTsConfig(gatsbyConfigPathTs);
  }

  console.log(
    `Injecting Gatsby.js analytics plugin "${GATSBY_PLUGIN_PACKAGE_NAME}" to \`${gatsbyConfigPathJs}\``
  );
  await addGatsbyPackage(dir);
  if (await fileExists(gatsbyConfigPathJs)) {
    await updateGatsbyJsConfig(gatsbyConfigPathJs);
  } else {
    await fs.writeFile(
      gatsbyConfigPathJs,
      `module.exports = ${JSON.stringify(DEFAULT_CONFIG)}`
    );
  }
}

async function addGatsbyPackage(dir: string): Promise<void> {
  const pkgJson = (await readPackageJson(dir)) as DeepWriteable<PackageJson>;
  if (!pkgJson.dependencies) {
    pkgJson.dependencies = {};
  }
  if (!pkgJson.dependencies[GATSBY_PLUGIN_PACKAGE_NAME]) {
    console.log(
      `Adding "${GATSBY_PLUGIN_PACKAGE_NAME}" to \`package.json\` "dependencies"`
    );
    pkgJson.dependencies[GATSBY_PLUGIN_PACKAGE_NAME] = 'latest';

    await writePackageJson(dir, pkgJson);
  }
}

async function updateGatsbyTsConfig(configPath: string): Promise<void> {
  await fs.rename(configPath, configPath + '.__vercel_builder_backup__.ts');

  await fs.writeFile(
    configPath,
    `import userConfig from "./gatsby-config.ts.__vercel_builder_backup__.ts";
import type { PluginRef } from "gatsby";

// https://github.com/gatsbyjs/gatsby/blob/354003fb2908e02ff12109ca3a02978a5a6e608c/packages/gatsby/src/bootstrap/prefer-default.ts
const preferDefault = (m: any) => (m && m.default) || m;

const vercelConfig = Object.assign(
  {},

  // https://github.com/gatsbyjs/gatsby/blob/a6ecfb2b01d761e8a3612b8ea132c698659923d9/packages/gatsby/src/services/initialize.ts#L113-L117
  preferDefault(userConfig)
);
if (!vercelConfig.plugins) {
  vercelConfig.plugins = [];
}

const hasPlugin = vercelConfig.plugins.find(
  (p: PluginRef) =>
    p && (p === "gatsby-plugin-vercel" || p.resolve === "gatsby-plugin-vercel")
);

if (!hasPlugin) {
  vercelConfig.plugins = vercelConfig.plugins.slice();
  vercelConfig.plugins.push({
    resolve: "gatsby-plugin-vercel",
    options: {},
  });
}

export default vercelConfig;
`
  );
}

async function updateGatsbyJsConfig(configPath: string): Promise<void> {
  await fs.rename(configPath, configPath + '.__vercel_builder_backup__.js');

  await fs.writeFile(
    configPath,
    `const userConfig = require("./gatsby-config.js.__vercel_builder_backup__.js");

// https://github.com/gatsbyjs/gatsby/blob/354003fb2908e02ff12109ca3a02978a5a6e608c/packages/gatsby/src/bootstrap/prefer-default.ts
const preferDefault = m => (m && m.default) || m;

const vercelConfig = Object.assign(
  {},

  // https://github.com/gatsbyjs/gatsby/blob/a6ecfb2b01d761e8a3612b8ea132c698659923d9/packages/gatsby/src/services/initialize.ts#L113-L117
  preferDefault(userConfig)
);
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
}
