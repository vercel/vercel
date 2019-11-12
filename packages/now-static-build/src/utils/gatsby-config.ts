import { writeFile, copyFile, mkdir } from 'fs';
import { join, dirname } from 'path';
import { promisify } from 'util';

const writeFilePromise = promisify(writeFile);
const mkdirPromise = promisify(mkdir);
const copyFilePromise = promisify(copyFile);

const GATSBY_PLUGIN_NOW_NAME = 'gatsby-plugin-now';
const GATSBY_USER_CONFIG_PATH = './__now_gatsby_config_user.js';

function createGatsbyConfig(hasUserConfig: boolean) {
  return `let userConfig = {}

${hasUserConfig ? `userConfig = require('${GATSBY_USER_CONFIG_PATH}')` : ''}

module.exports = {
  ...userConfig,
  plugins: [
    ...(userConfig.plugins || []),
    '${GATSBY_PLUGIN_NOW_NAME}'
  ]
}`;
}

export async function injectGatsbyConfig(entrypointDir: string) {
  try {
    // first, we copy gatsby-plugin-now to plugins
    const gatsbyPluginNowPath = join(
      entrypointDir,
      'plugins',
      GATSBY_PLUGIN_NOW_NAME
    );

    try {
      await mkdirPromise(dirname(gatsbyPluginNowPath));
    } catch (err) {
      // plugins folder already exists, ignore error
    }

    await mkdirPromise(gatsbyPluginNowPath);

    await copyFilePromise(
      require.resolve('./gatsby-plugin-now/gatsby-node.js'),
      join(gatsbyPluginNowPath, 'gatsby-node.js')
    );
    await copyFilePromise(
      require.resolve('./gatsby-plugin-now/package.json'),
      join(gatsbyPluginNowPath, 'package.json')
    );

    // then, we wrap the existing config and
    // inject the plugin into the config
    let hasUserConfig = false;
    try {
      await copyFilePromise(
        join(entrypointDir, 'gatsby-config.js'),
        join(entrypointDir, GATSBY_USER_CONFIG_PATH)
      );
      hasUserConfig = true;
    } catch (err) {
      // do nothing here, it just means the user
      // didn't define gatsby-config.js
    }

    await writeFilePromise(
      join(entrypointDir, 'gatsby-config.js'),
      createGatsbyConfig(hasUserConfig),
      { encoding: 'utf-8' }
    );
  } catch (err) {
    // if a step fail, we can ignore the error since we're not breaking
    // the user's gatsby configuration
  }
}
