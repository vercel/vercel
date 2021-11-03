import code from '../util/output/code';
import { getColorForPkgName } from '../util/output/color-name-cache';
import cliPkgJson from '../util/pkg';
import { scanParentDirs } from '@vercel/build-utils';
import { Output } from './output';

const VERCEL_PLUGIN_PREFIX = 'vercel-plugin-';

export async function loadCliPlugins(cwd: string, output: Output) {
  const { packageJson } = await scanParentDirs(cwd, true);

  let pluginCount = 0;
  const preBuildPlugins = [];
  const buildPlugins = [];
  const devServerPlugins = [];
  const devMiddlewarePlugins = [];
  const deps = new Set(
    [
      ...Object.keys(packageJson?.dependencies || {}),
      ...Object.keys(packageJson?.devDependencies || {}),
      ...Object.keys(cliPkgJson.dependencies),
    ].filter(dep => dep.startsWith(VERCEL_PLUGIN_PREFIX))
  );

  for (let dep of deps) {
    pluginCount++;
    const resolved = require.resolve(dep, {
      paths: [cwd, process.cwd(), __dirname],
    });
    let plugin;
    try {
      plugin = require(resolved);

      const color = getColorForPkgName(dep);
      if (typeof plugin.preBuild === 'function') {
        preBuildPlugins.push({
          plugin,
          name: dep,
          color,
        });
      }
      if (typeof plugin.build === 'function') {
        buildPlugins.push({
          plugin,
          name: dep,
          color,
        });
      }
      if (typeof plugin.startDevServer === 'function') {
        devServerPlugins.push({
          plugin,
          name: dep,
          color,
        });
      }
      if (typeof plugin.runDevMiddleware === 'function') {
        devMiddlewarePlugins.push({
          plugin,
          name: dep,
          color,
        });
      }
    } catch (error) {
      output.error(`Failed to import ${code(dep)}`);
      throw error;
    }
  }

  /**
   * This is might be wrong... should we support more than one plugin defining runDevMiddleware?
   * Should the middleware plugin ALWAYS be added? What about when a different framework defines
   * a runDevMiddleware plugin?
   */
  if (devMiddlewarePlugins.length > 1) {
    const message = `Only one middlware plugin is supported at a time. Found [${devMiddlewarePlugins
      .map(plugin => plugin.name)
      .join(', ')}]`;
    output.error(message);
    throw new Error(message);
  }

  return {
    pluginCount,
    preBuildPlugins,
    buildPlugins,
    devServerPlugins,
    devMiddlewarePlugins,
  };
}
