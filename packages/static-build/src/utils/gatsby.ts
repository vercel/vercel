import { promises as fs } from 'fs';
import * as path from 'path';
import semver from 'semver';
import { fileExists } from './_shared';

const PLUGINS = [
  '@vercel/gatsby-plugin-vercel-analytics',
  '@vercel/gatsby-plugin-vercel-builder',
] as const;
type PluginName = typeof PLUGINS[number];

const GATSBY_CONFIG_FILE = 'gatsby-config';
const GATSBY_NODE_FILE = 'gatsby-node';

const GATSBY_BUILDER_PATH = eval('require').resolve(
  `@vercel/gatsby-plugin-vercel-builder/gatsby-node.js`
);
const GATSBY_ANALYTICS_PATH = eval('require').resolve(
  `@vercel/gatsby-plugin-vercel-analytics`
);
console.log({ GATSBY_ANALYTICS_PATH, GATSBY_BUILDER_PATH });

export async function injectPlugins(
  detectedVersion: string | null,
  dir: string
) {
  const plugins = new Set<PluginName>();

  if (process.env.VERCEL_GATSBY_BUILDER_PLUGIN === '1' && detectedVersion) {
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

  let pluginsStr = 'plugin';
  if (plugins.size > 1) {
    pluginsStr += 's';
  }
  console.log(
    `Injecting Gatsby.js ${pluginsStr} ${Array.from(plugins)
      .map(p => `"${p}"`)
      .join(', ')}`
  );

  const ops = [];

  if (plugins.has('@vercel/gatsby-plugin-vercel-analytics')) {
    ops.push(
      updateGatsbyConfig(dir, { '@vercel/gatsby-plugin-vercel-analytics': '' })
    );
  }

  if (plugins.has('@vercel/gatsby-plugin-vercel-builder')) {
    ops.push(updateGatsbyNode(dir));
  }

  await Promise.all(ops);

  return true;
}

async function updateGatsbyConfig(
  dir: string,
  plugins: Partial<Record<PluginName, string>>
) {
  const gatsbyConfigPathTs = path.join(dir, `${GATSBY_CONFIG_FILE}.ts`);
  const gatsbyConfigPathMjs = path.join(dir, `${GATSBY_CONFIG_FILE}.mjs`);
  const gatsbyConfigPathJs = path.join(dir, `${GATSBY_CONFIG_FILE}.js`);
  if (await fileExists(gatsbyConfigPathTs)) {
    await updateGatsbyConfigTs(gatsbyConfigPathTs, plugins);
  } else if (await fileExists(gatsbyConfigPathMjs)) {
    await updateGatsbyConfigMjs(gatsbyConfigPathMjs, plugins);
  } else if (await fileExists(gatsbyConfigPathJs)) {
    await updateGatsbyConfigMjs(gatsbyConfigPathJs, plugins);
  } else {
    await fs.writeFile(
      gatsbyConfigPathMjs,
      `export default ${JSON.stringify({
        plugins: Object.values(plugins),
      })}`
    );
  }
}

async function updateGatsbyConfigTs(
  configPath: string,
  plugins: Partial<Record<PluginName, string>>
): Promise<void> {
  const renamedPath = `${configPath}.__vercel_builder_backup__.ts`;
  if (!(await fileExists(renamedPath))) {
    await fs.rename(configPath, renamedPath);
  }
  const relativeRenamedPath = `.${path.sep}${path.basename(renamedPath)}`;

  await fs.writeFile(
    configPath,
    `import userConfig from ${JSON.stringify(relativeRenamedPath)}
import type { PluginRef } from "gatsby";

const preferDefault = (m: any) => (m && m.default) || m;

const vercelConfig = Object.assign(
  {},
  preferDefault(userConfig)
);

if (!vercelConfig.plugins) {
  vercelConfig.plugins = [];
}

const injectedPlugins = ${JSON.stringify(plugins)};

for (const plugin of Object.keys(plugins)) {
  const hasPlugin = vercelConfig.plugins.find(
    (p: PluginRef) =>
      p && (p === plugin || p.resolve === plugin)
  );

  if (!hasPlugin) {
    vercelConfig.plugins = vercelConfig.plugins.slice();
    vercelConfig.plugins.push(injectedPlugins[plugin]);
  }
}

export default vercelConfig;
`
  );
}

async function updateGatsbyConfigMjs(
  configPath: string,
  plugins: Partial<Record<PluginName, string>>
): Promise<void> {
  const renamedPath = `${configPath}.__vercel_builder_backup__${path.extname(
    configPath
  )}`;
  if (!(await fileExists(renamedPath))) {
    await fs.rename(configPath, renamedPath);
  }
  const relativeRenamedPath = `.${path.sep}${path.basename(renamedPath)}`;

  await fs.writeFile(
    configPath.replace(/\.js$/, '.mjs'),
    `import userConfig from ${JSON.stringify(relativeRenamedPath)};

const preferDefault = (m) => (m && m.default) || m;

const vercelConfig = Object.assign(
  {},
  preferDefault(userConfig)
);

if (!vercelConfig.plugins) {
  vercelConfig.plugins = [];
}

const injectedPlugins = ${JSON.stringify(plugins)};

for (const plugin of Object.keys(injectedPlugins)) {
  const hasPlugin = vercelConfig.plugins.find(
    (p) => p && (p === plugin || p.resolve === plugin)
  );

  if (!hasPlugin) {
    vercelConfig.plugins = vercelConfig.plugins.slice();
    vercelConfig.plugins.push(injectedPlugins[plugin]);
  }
}

export default vercelConfig;
`
  );
}

async function updateGatsbyNode(dir: string) {
  const gatsbyNodePathTs = path.join(dir, `${GATSBY_NODE_FILE}.ts`);
  const gatsbyNodePathJs = path.join(dir, `${GATSBY_NODE_FILE}.js`);
  if (await fileExists(gatsbyNodePathTs)) {
    await updateGatsbyNodeTs(gatsbyNodePathTs);
  } else if (await fileExists(gatsbyNodePathJs)) {
    await updateGatsbyNodeJs(gatsbyNodePathJs);
  } else {
    await fs.writeFile(
      gatsbyNodePathJs,
      `module.exports = ${JSON.stringify(GATSBY_BUILDER_PATH)};`
    );
  }
}

async function updateGatsbyNodeTs(configPath: string) {
  const renamedPath = `${configPath}.__vercel_builder_backup__.ts`;
  if (!(await fileExists(renamedPath))) {
    await fs.rename(configPath, renamedPath);
  }
  const relativeRenamedPath = `.${path.sep}${path.basename(renamedPath)}`;

  await fs.writeFile(
    configPath,
    `import type { GatsbyNode } from 'gatsby';
import * as vercelBuilder from ${JSON.stringify(GATSBY_BUILDER_PATH)};
import * as gatsbyNode from ${JSON.stringify(relativeRenamedPath)};

export * from ${JSON.stringify(relativeRenamedPath)};

export const onPostBuild: GatsbyNode['onPostBuild'] = async (args, options) => {
  if (typeof (gatsbyNode as any).onPostBuild === 'function') {
    await (gatsbyNode as any).onPostBuild(args, options);
  }
  await vercelBuilder.onPostBuild(args, options);
};
`
  );
}

async function updateGatsbyNodeJs(configPath: string) {
  const renamedPath = `${configPath}.__vercel_builder_backup__${path.extname(
    configPath
  )}`;
  if (!(await fileExists(renamedPath))) {
    await fs.rename(configPath, renamedPath);
  }
  const relativeRenamedPath = `.${path.sep}${path.basename(renamedPath)}`;

  await fs.writeFile(
    configPath,
    `const vercelBuilder = require(${JSON.stringify(GATSBY_BUILDER_PATH)});
const gatsbyNode = require(${JSON.stringify(relativeRenamedPath)});

const origOnPostBuild = gatsbyNode.onPostBuild;

export const onPostBuild = async (args, options) => {
  if (typeof origOnPostBuild === 'function') {
    await origOnPostBuild(args, options);
  }
  await vercelBuilder.onPostBuild(args, options);
};

module.exports = gatsbyNode;
`
  );
}
