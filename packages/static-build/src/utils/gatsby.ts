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

const { VERCEL_CLI_VERSION } = process.env;

const PLUGINS = [
  '@vercel/gatsby-plugin-vercel-analytics',
  '@vercel/gatsby-plugin-vercel-builder',
] as const;
type PluginName = typeof PLUGINS[number];

const GATSBY_CONFIG_FILE = 'gatsby-config';
const GATSBY_NODE_FILE = 'gatsby-node';

export async function injectPlugins(
  detectedVersion: string | null,
  dir: string
) {
  const plugins = new Set<PluginName>();

  if (process.env.VERCEL_GATSBY_BUILDER_PLUGIN && detectedVersion) {
    const version = semver.coerce(detectedVersion);
    if (version && semver.satisfies(version, '>=4.0.0')) {
      plugins.add('@vercel/gatsby-plugin-vercel-builder');
    }
  }

  if (process.env.VERCEL_ANALYTICS_ID) {
    process.env.GATSBY_VERCEL_ANALYTICS_ID = process.env.VERCEL_ANALYTICS_ID;
    plugins.add('@vercel/gatsby-plugin-vercel-analytics');
  }

  if (plugins.size === 0) {
    return false;
  }

  const ops = [addGatsbyPackage(dir, plugins)];

  if (plugins.has('@vercel/gatsby-plugin-vercel-analytics')) {
    ops.push(
      updateGatsbyConfig(dir, ['@vercel/gatsby-plugin-vercel-analytics'])
    );
  }

  if (plugins.has('@vercel/gatsby-plugin-vercel-builder')) {
    ops.push(updateGatsbyNode(dir));
  }

  await Promise.all(ops);

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
      let version = 'latest';

      // Use the tarball URL for E2E tests
      if (VERCEL_CLI_VERSION?.startsWith('https://')) {
        version = new URL(`./${plugin}.tgz`, VERCEL_CLI_VERSION).href;
      }

      pkgJson.dependencies[plugin] = version;
    }
  }

  await writePackageJson(dir, pkgJson);
}

async function updateGatsbyConfig(dir: string, plugins: Iterable<PluginName>) {
  const gatsbyConfigPathTs = path.join(dir, `${GATSBY_CONFIG_FILE}.ts`);
  const gatsbyConfigPathMjs = path.join(dir, `${GATSBY_CONFIG_FILE}.mjs`);
  const gatsbyConfigPathJs = path.join(dir, `${GATSBY_CONFIG_FILE}.js`);
  if (await fileExists(gatsbyConfigPathTs)) {
    printInjectingPlugins(plugins, gatsbyConfigPathTs);
    await updateGatsbyConfigTs(gatsbyConfigPathTs, plugins);
  } else if (await fileExists(gatsbyConfigPathMjs)) {
    printInjectingPlugins(plugins, gatsbyConfigPathMjs);
    await updateGatsbyConfigMjs(gatsbyConfigPathMjs, plugins);
  } else {
    printInjectingPlugins(plugins, gatsbyConfigPathJs);
    if (await fileExists(gatsbyConfigPathJs)) {
      await updateGatsbyConfigJs(gatsbyConfigPathJs, plugins);
    } else {
      await fs.writeFile(
        gatsbyConfigPathJs,
        `module.exports = ${JSON.stringify({
          plugins: Array.from(plugins),
        })}`
      );
    }
  }
}

async function updateGatsbyConfigTs(
  configPath: string,
  plugins: Iterable<PluginName>
): Promise<void> {
  const renamedPath = `${configPath}.__vercel_builder_backup__.ts`;
  if (!(await fileExists(renamedPath))) {
    await fs.rename(configPath, renamedPath);
  }

  await fs.writeFile(
    configPath,
    `import userConfig from "./gatsby-config.ts.__vercel_builder_backup__.ts";
import type { PluginRef } from "gatsby";

const preferDefault = (m: any) => (m && m.default) || m;

const vercelConfig = Object.assign(
  {},
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

async function updateGatsbyConfigMjs(
  configPath: string,
  plugins: Iterable<PluginName>
): Promise<void> {
  const renamedPath = `${configPath}.__vercel_builder_backup__.mjs`;
  if (!(await fileExists(renamedPath))) {
    await fs.rename(configPath, renamedPath);
  }

  await fs.writeFile(
    configPath,
    `import userConfig from "./gatsby-config.mjs.__vercel_builder_backup__.mjs";

const preferDefault = (m) => (m && m.default) || m;

const vercelConfig = Object.assign(
  {},
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

async function updateGatsbyConfigJs(
  configPath: string,
  plugins: Iterable<PluginName>
): Promise<void> {
  const renamedPath = `${configPath}.__vercel_builder_backup__.js`;
  if (!(await fileExists(renamedPath))) {
    await fs.rename(configPath, renamedPath);
  }

  await fs.writeFile(
    configPath,
    `const userConfig = require("./gatsby-config.js.__vercel_builder_backup__.js");

const preferDefault = m => (m && m.default) || m;

const vercelConfig = Object.assign(
  {},
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

async function updateGatsbyNode(dir: string) {
  const gatsbyNodePathTs = path.join(dir, `${GATSBY_NODE_FILE}.ts`);
  const gatsbyNodePathMjs = path.join(dir, `${GATSBY_NODE_FILE}.mjs`);
  const gatsbyNodePathJs = path.join(dir, `${GATSBY_NODE_FILE}.js`);
  if (await fileExists(gatsbyNodePathTs)) {
    await updateGatsbyNodeTs(gatsbyNodePathTs);
  } else if (await fileExists(gatsbyNodePathMjs)) {
    await updateGatsbyNodeMjs(gatsbyNodePathMjs);
  } else if (await fileExists(gatsbyNodePathJs)) {
    await updateGatsbyNodeJs(gatsbyNodePathJs);
  } else {
    await fs.writeFile(
      gatsbyNodePathJs,
      `module.exports = require('@vercel/gatsby-plugin-vercel-builder');`
    );
  }
}

async function updateGatsbyNodeTs(configPath: string) {
  const renamedPath = `${configPath}.__vercel_builder_backup__.ts`;
  if (!(await fileExists(renamedPath))) {
    await fs.rename(configPath, renamedPath);
  }

  await fs.writeFile(
    configPath,
    `import type { GatsbyNode } from 'gatsby';
import * as vercelBuilder from '@vercel/gatsby-plugin-vercel-builder';
import * as gatsbyNode from './gatsby-node.ts.__vercel_builder_backup__.ts';

export * from './gatsby-node.ts.__vercel_builder_backup__.ts';

export const onPostBuild: GatsbyNode['onPostBuild'] = async (args, options) => {
  if (typeof (gatsbyNode as any).onPostBuild === 'function') {
    await (gatsbyNode as any).onPostBuild(args, options);
  }
  await vercelBuilder.onPostBuild(args, options);
};
`
  );
}

async function updateGatsbyNodeMjs(configPath: string) {
  const renamedPath = `${configPath}.__vercel_builder_backup__.mjs`;
  if (!(await fileExists(renamedPath))) {
    await fs.rename(configPath, renamedPath);
  }

  await fs.writeFile(
    configPath,
    `import * as vercelBuilder from '@vercel/gatsby-plugin-vercel-builder/gatsby-node.js';
import * as gatsbyNode from './gatsby-node.mjs.__vercel_builder_backup__.mjs';

export * from './gatsby-node.mjs.__vercel_builder_backup__.mjs';

export const onPostBuild = async (args, options) => {
  if (typeof gatsbyNode.onPostBuild === 'function') {
    await gatsbyNode.onPostBuild(args, options);
  }
  await vercelBuilder.onPostBuild(args, options);
};
`
  );
}

async function updateGatsbyNodeJs(configPath: string) {
  const renamedPath = `${configPath}.__vercel_builder_backup__.js`;
  if (!(await fileExists(renamedPath))) {
    await fs.rename(configPath, renamedPath);
  }

  await fs.writeFile(
    configPath,
    `const vercelBuilder = require('@vercel/gatsby-plugin-vercel-builder/gatsby-node.js');
const gatsbyNode = require('./gatsby-node.js.__vercel_builder_backup__.js');

const origOnPostBuild = gatsbyNode.onPostBuild;

gatsbyNode.onPostBuild = async (args, options) => {
  if (typeof origOnPostBuild === 'function') {
    await origOnPostBuild(args, options);
  }
  await vercelBuilder.onPostBuild(args, options);
};

module.exports = gatsbyNode;
`
  );
}
