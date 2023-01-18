import { PackageJson } from '@vercel/build-utils';
import { promises as fs } from 'fs';
import * as path from 'path';
import semver from 'semver';
import {
  fileExists,
  readPackageJson,
  DeepWriteable,
  writePackageJson,
} from './_shared';

const PLUGINS = {
  GATSBY_PLUGIN_VERCEL_ANALYTICS: '@vercel/gatsby-plugin-vercel-analytics',
  GATSBY_PLUGIN_VERCEL_BUILDER: '@vercel/gatsby-plugin-vercel-builder',
};

const GATSBY_CONFIG_FILE = 'gatsby-config';

export async function injectPlugins(
  detectedVersion: string | null,
  dir: string
) {
  const pluginsToInject = [];

  if (process.env.VERCEL_GATSBY_BUILDER_PLUGIN && detectedVersion) {
    const version = semver.coerce(detectedVersion);
    if (version && semver.satisfies(version, '>=4.0.0')) {
      pluginsToInject.push(PLUGINS.GATSBY_PLUGIN_VERCEL_BUILDER);
    }
  }

  if (process.env.VERCEL_ANALYTICS_ID) {
    process.env.GATSBY_VERCEL_ANALYTICS_ID = process.env.VERCEL_ANALYTICS_ID;
    pluginsToInject.push(PLUGINS.GATSBY_PLUGIN_VERCEL_ANALYTICS);
  }

  if (pluginsToInject.length === 0) {
    return;
  }

  const gatsbyConfigPathJs = path.join(dir, `${GATSBY_CONFIG_FILE}.js`);
  const gatsbyConfigPathMjs = path.join(dir, `${GATSBY_CONFIG_FILE}.mjs`);
  const gatsbyConfigPathTs = path.join(dir, `${GATSBY_CONFIG_FILE}.ts`);

  if (await fileExists(gatsbyConfigPathTs)) {
    console.log(
      `Injecting Gatsby.js plugins "${pluginsToInject}" to \`${gatsbyConfigPathTs}\``
    );
    await addGatsbyPackage(dir, pluginsToInject);
    return updateGatsbyTsConfig(gatsbyConfigPathTs, pluginsToInject);
  }

  if (await fileExists(gatsbyConfigPathMjs)) {
    console.log(
      `Injecting Gatsby.js plugins "${pluginsToInject}" to \`${gatsbyConfigPathMjs}\``
    );
    await addGatsbyPackage(dir, pluginsToInject);
    return updateGatsbyMjsConfig(gatsbyConfigPathMjs, pluginsToInject);
  }

  console.log(
    `Injecting Gatsby.js plugins "${pluginsToInject}" to \`${gatsbyConfigPathJs}\``
  );
  await addGatsbyPackage(dir, pluginsToInject);
  if (await fileExists(gatsbyConfigPathJs)) {
    await updateGatsbyJsConfig(gatsbyConfigPathJs, pluginsToInject);
  } else {
    await fs.writeFile(
      gatsbyConfigPathJs,
      `module.exports = ${JSON.stringify({
        plugins: pluginsToInject,
      })}`
    );
  }
}

async function addGatsbyPackage(
  dir: string,
  plugins: Array<string>
): Promise<void> {
  const pkgJson = (await readPackageJson(dir)) as DeepWriteable<PackageJson>;
  if (!pkgJson.dependencies) {
    pkgJson.dependencies = {};
  }

  for (const plugin of plugins) {
    if (!pkgJson.dependencies[plugin]) {
      console.log(`Adding "${plugin}" to \`package.json\` "dependencies"`);
      pkgJson.dependencies[plugin] = 'latest';
    }
  }

  await writePackageJson(dir, pkgJson);
}

async function updateGatsbyTsConfig(
  configPath: string,
  plugins: Array<string>
): Promise<void> {
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

for (const plugin of ${JSON.stringify(plugins)}) {
  const hasPlugin = vercelConfig.plugins.find(
    (p: PluginRef) =>
      p && (p === plugin || p.resolve === plugin)
  );

  if (!hasPlugin) {
    vercelConfig.plugins = vercelConfig.plugins.slice();
    vercelConfig.plugins.push(plugin);
  }
}

export default vercelConfig;
`
  );
}

async function updateGatsbyMjsConfig(
  configPath: string,
  plugins: Array<string>
): Promise<void> {
  await fs.rename(configPath, configPath + '.__vercel_builder_backup__.mjs');

  await fs.writeFile(
    configPath,
    `import userConfig from "./gatsby-config.mjs.__vercel_builder_backup__.mjs";

// https://github.com/gatsbyjs/gatsby/blob/354003fb2908e02ff12109ca3a02978a5a6e608c/packages/gatsby/src/bootstrap/prefer-default.ts
const preferDefault = (m) => (m && m.default) || m;

const vercelConfig = Object.assign(
  {},
  // https://github.com/gatsbyjs/gatsby/blob/a6ecfb2b01d761e8a3612b8ea132c698659923d9/packages/gatsby/src/services/initialize.ts#L113-L117
  preferDefault(userConfig)
);
if (!vercelConfig.plugins) {
  vercelConfig.plugins = [];
}

for (const plugin of ${JSON.stringify(plugins)}) {
  const hasPlugin = vercelConfig.plugins.find(
    (p) => p && (p === plugin || p.resolve === plugin)
  );

  if (!hasPlugin) {
    vercelConfig.plugins = vercelConfig.plugins.slice();
    vercelConfig.plugins.push(plugin);
  }
}

export default vercelConfig;
`
  );
}

async function updateGatsbyJsConfig(
  configPath: string,
  plugins: Array<string>
): Promise<void> {
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

for (const plugin of ${JSON.stringify(plugins)}) {
  const hasPlugin = vercelConfig.plugins.find(
    (p) => p && (p === plugin || p.resolve === plugin)
  );

  if (!hasPlugin) {
    vercelConfig.plugins = vercelConfig.plugins.slice();
    vercelConfig.plugins.push(plugin);
  }
}
module.exports = vercelConfig;
`
  );
}
