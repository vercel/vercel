import { PackageJson } from '@vercel/build-utils';
import { promises as fs } from 'fs';
import * as path from 'path';
import semver from 'semver';
import { URL } from 'url';
import {
  fileExists,
  readPackageJson,
  DeepWriteable,
  writePackageJson,
} from './_shared';

const PLUGINS = [
  '@vercel/gatsby-plugin-vercel-analytics',
  '@vercel/gatsby-plugin-vercel-builder',
] as const;
type PluginName = typeof PLUGINS[number];

const PLUGIN_VERSIONS = new Map<PluginName, string>([
  ['@vercel/gatsby-plugin-vercel-analytics', 'latest'],
  ['@vercel/gatsby-plugin-vercel-builder', 'latest'],
]);

// For E2E tests, ensure the same version of the plugin is used as the source code
const { VERCEL_CLI_VERSION } = process.env;
if (VERCEL_CLI_VERSION?.startsWith('https://')) {
  for (const name of PLUGIN_VERSIONS.keys()) {
    const url = new URL(`./${name}.tgz`, VERCEL_CLI_VERSION);
    PLUGIN_VERSIONS.set(name, url.href);
  }
}
console.log(PLUGIN_VERSIONS);

const GATSBY_CONFIG_FILE = 'gatsby-config';

export async function injectPlugins(
  detectedVersion: string | null,
  dir: string
) {
  const pluginsToInject = new Set<PluginName>();

  if (process.env.VERCEL_GATSBY_BUILDER_PLUGIN && detectedVersion) {
    const version = semver.coerce(detectedVersion);
    if (version && semver.satisfies(version, '>=4.0.0')) {
      pluginsToInject.add('@vercel/gatsby-plugin-vercel-builder');
    }
  }

  if (process.env.VERCEL_ANALYTICS_ID) {
    process.env.GATSBY_VERCEL_ANALYTICS_ID = process.env.VERCEL_ANALYTICS_ID;
    pluginsToInject.add('@vercel/gatsby-plugin-vercel-analytics');
  }

  if (pluginsToInject.size === 0) {
    return false;
  }

  await addGatsbyPackage(dir, pluginsToInject);

  const gatsbyConfigPathTs = path.join(dir, `${GATSBY_CONFIG_FILE}.ts`);
  const gatsbyConfigPathMjs = path.join(dir, `${GATSBY_CONFIG_FILE}.mjs`);
  const gatsbyConfigPathJs = path.join(dir, `${GATSBY_CONFIG_FILE}.js`);
  if (await fileExists(gatsbyConfigPathTs)) {
    printInjectingPlugins(pluginsToInject, gatsbyConfigPathTs);
    await updateGatsbyTsConfig(gatsbyConfigPathTs, pluginsToInject);
  } else if (await fileExists(gatsbyConfigPathMjs)) {
    printInjectingPlugins(pluginsToInject, gatsbyConfigPathMjs);
    await updateGatsbyMjsConfig(gatsbyConfigPathMjs, pluginsToInject);
  } else {
    printInjectingPlugins(pluginsToInject, gatsbyConfigPathJs);
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
  return true;
}

function printInjectingPlugins(
  plugins: Iterable<PluginName>,
  configPath: string
) {
  const pluginsArray = Array.from(plugins);
  let pluginsStr = 'plugin';
  if (pluginsArray.length > 1) {
    pluginsStr += 's';
  }
  console.log(
    `Injecting Gatsby.js ${pluginsStr} ${pluginsArray
      .map(p => `"${p}"`)
      .join(', ')} to \`${configPath}\``
  );
}

async function addGatsbyPackage(
  dir: string,
  plugins: Iterable<PluginName>
): Promise<void> {
  const pkgJson = (await readPackageJson(dir)) as DeepWriteable<PackageJson>;
  if (!pkgJson.dependencies) {
    pkgJson.dependencies = {};
  }

  for (const plugin of plugins) {
    if (!pkgJson.dependencies[plugin]) {
      console.log(`Adding "${plugin}" to \`package.json\` "dependencies"`);
      pkgJson.dependencies[plugin] = PLUGIN_VERSIONS.get(plugin) ?? 'latest';
    }
  }

  await writePackageJson(dir, pkgJson);
}

async function updateGatsbyTsConfig(
  configPath: string,
  plugins: Iterable<PluginName>
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

for (const plugin of ${JSON.stringify(Array.from(plugins))}) {
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
  plugins: Iterable<PluginName>
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

for (const plugin of ${JSON.stringify(Array.from(plugins))}) {
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
  plugins: Iterable<PluginName>
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

for (const plugin of ${JSON.stringify(Array.from(plugins))}) {
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
