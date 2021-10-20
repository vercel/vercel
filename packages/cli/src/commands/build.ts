import { loadEnvConfig } from '@next/env';
import { isAbsolute } from '@sentry/utils';
import {
  execCommand,
  getScriptName,
  scanParentDirs,
  spawnAsync,
} from '@vercel/build-utils';
import chalk from 'chalk';
import { SpawnOptions } from 'child_process';
import { assert } from 'console';
import fs from 'fs-extra';
import { join } from 'path';
import pluralize from 'pluralize';
import Client from '../util/client';
import getArgs from '../util/get-args';
import handleError from '../util/handle-error';
import { isSettingValue } from '../util/is-setting-value';
import cmd from '../util/output/cmd';
import code from '../util/output/code';
import param from '../util/output/param';
import stamp from '../util/output/stamp';
import { getCommandName } from '../util/pkg-name';
import { findFramework } from '../util/projects/find-framework';
import { VERCEL_DIR } from '../util/projects/link';
import {
  ProjectLinkAndSettings,
  readProjectSettings,
} from '../util/projects/project-settings';
import pull from './pull';

const help = () => {
  // @todo help output
  return console.log('vercel build');
};

const OUTPUT_DIR = '.output';
const VERCEL_PLUGIN_PREFIX = 'vercel-plugin-';

const fields: {
  name: string;
  value: keyof ProjectLinkAndSettings['settings'];
}[] = [
  { name: 'Directory Listing', value: 'directoryListing' },
  { name: 'Build Command', value: 'buildCommand' },
  { name: 'Output Directory', value: 'outputDirectory' },
  { name: 'Root Directory', value: 'rootDirectory' },
  { name: 'Development Command', value: 'devCommand' },
];

export default async function main(client: Client) {
  let argv;
  try {
    argv = getArgs(client.argv.slice(2));
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  let cwd = argv._[1] || process.cwd();

  let project = await readProjectSettings(join(cwd, VERCEL_DIR));
  // If there are no project settings, only then do we pull them down
  while (!project?.settings) {
    const result = await pull(client);
    if (result !== 0) {
      return result;
    }
    project = await readProjectSettings(join(cwd, VERCEL_DIR));
  }

  cwd = project.settings.rootDirectory
    ? join(cwd, project.settings.rootDirectory)
    : cwd;

  // Load the environment
  const { combinedEnv, loadedEnvFiles } = loadEnvConfig(cwd, false, {
    info: () => ({}), // we don't want to log this yet.
    error: (...args: any[]) => client.output.error(args.join(' ')),
  });

  const spawnOpts = {
    env: { ...combinedEnv, VERCEL: '1' },
  };

  process.chdir(cwd);

  const framework = findFramework(project.settings.framework);
  const buildState = { ...project.settings };
  if (framework) {
    client.output.log(`Retrieved Project Settings:`);
    client.output.print(
      chalk.dim(`  - ${chalk.bold(`Framework Preset:`)} ${framework.name}\n`)
    );

    for (let field of fields) {
      const defaults = (framework.settings as any)[field.value];
      if (defaults) {
        client.output.print(
          chalk.dim(
            `  - ${chalk.bold(`${field.name}:`)} ${`${
              project.settings[field.value]
                ? project.settings[field.value] + ` (override)`
                : isSettingValue(defaults)
                ? defaults.value
                : chalk.italic(`${defaults.placeholder}`)
            }`}\n`
          )
        );
      }
      (buildState as any)[field.value] = project.settings[field.value]
        ? project.settings[field.value]
        : defaults
        ? isSettingValue(defaults)
          ? defaults.value
          : null
        : null;
    }
  }

  if (loadedEnvFiles.length > 0) {
    client.output.log(
      `Loaded Environment Variables from ${loadedEnvFiles.length} ${pluralize(
        'file',
        loadedEnvFiles.length
      )}:`
    );
    for (let envFile of loadedEnvFiles) {
      client.output.print(chalk.dim(`  - ${envFile.path}\n`));
    }
  }

  // Load plugins
  let plugins;
  try {
    plugins = await loadCliPlugins(client, cwd);
  } catch (error) {
    client.output.error('Failed to load CLI Plugins');
    handleError(error);
    return 1;
  }

  if (plugins?.pluginCount && plugins?.pluginCount > 0) {
    client.output.log(
      `Loaded ${plugins.pluginCount} CLI ${pluralize(
        'Plugin',
        plugins.pluginCount
      )}`
    );
    // preBuild Plugins
    if (plugins.preBuildPlugins.length > 0) {
      client.output.log(
        `Running ${plugins.pluginCount} CLI ${pluralize(
          'Plugin',
          plugins.pluginCount
        )} before Build Command:`
      );
      for (let item of plugins.preBuildPlugins) {
        const { name, plugin } = item;
        if (typeof plugin.preBuild === 'function') {
          const pluginStamp = stamp();
          client.output.log(`Running ${code(name + '.preBuild')}`);
          try {
            await plugin.preBuild();
            client.output.log(
              `Completed ${code(name + '.preBuild')} ${chalk.dim(
                `${pluginStamp()}`
              )}`
            );
          } catch (error) {
            client.output.error(`${code(name + '.preBuild')} failed`);
            handleError(error);
            return 1;
          }
        }
      }
    }
  }

  let result: boolean;
  if (typeof buildState.buildCommand === 'string') {
    client.output.log(`Running Build Command: ${cmd(buildState.buildCommand)}`);
    result = await execCommand(buildState.buildCommand, {
      ...spawnOpts,
      // Yarn v2 PnP mode may be activated, so force
      // "node-modules" linker style
      env: {
        YARN_NODE_LINKER: 'node-modules',
        ...spawnOpts.env,
      },
      cwd: cwd,
    });
  } else {
    result = await runPackageJsonScript(
      client,
      cwd,
      ['vercel-build', 'now-build', 'build'],
      spawnOpts
    );
  }

  if (!result) {
    client.output.error(
      `Missing required "${cmd(
        buildState.buildCommand || 'vercel-build' || 'build'
      )}" script in ${param(cwd)}"\n`
    );
    return 1;
  }

  client.output.log(
    `Moving output from ${param(
      buildState.outputDirectory || '.next'
    )} to ${param(OUTPUT_DIR)}`
  );
  if (typeof buildState.outputDirectory !== 'string') {
    client.output.error(
      `Could not determine output directory. Please run ${getCommandName(
        'pull'
      )}.\n`
    );
    return 1;
  }

  const maybeOutputDir = await framework?.getOutputDirName(cwd);
  const realOutputDir = buildState.outputDirectory
    ? join(cwd, buildState.outputDirectory)
    : maybeOutputDir;

  if (realOutputDir) {
    await fs.pathExists(realOutputDir);
    // Move to .output
    await fs.remove(join(cwd, OUTPUT_DIR));
    await fs.move(realOutputDir, join(cwd, OUTPUT_DIR));
  }

  client.output.log(
    `Moved ${param(buildState.outputDirectory || '.next')} to ${param(
      OUTPUT_DIR
    )}`
  );

  // Build Plugins
  if (plugins?.buildPlugins && plugins.buildPlugins.length > 0) {
    client.output.log(
      `Running ${plugins.pluginCount} CLI ${pluralize(
        'Plugin',
        plugins.pluginCount
      )} after Build Command`
    );
    for (let item of plugins.buildPlugins) {
      const { name, plugin } = item;
      if (typeof plugin.build === 'function') {
        const pluginStamp = stamp();
        client.output.log(`Running ${code(name + '.build')}`);
        try {
          await plugin.build();
          client.output.log(
            `Completed ${code(name + '.build')} ${chalk.dim(
              `${pluginStamp()}`
            )}`
          );
        } catch (error) {
          client.output.error(`${code(name + '.build')} failed`);
          handleError(error);
          return 1;
        }
      }
    }
  }

  client.output.success('Build completed');

  return 0;
}

export async function runPackageJsonScript(
  client: Client,
  destPath: string,
  scriptNames: string | Iterable<string>,
  spawnOpts?: SpawnOptions
) {
  assert(isAbsolute(destPath));

  const { packageJson, cliType, lockfileVersion } = await scanParentDirs(
    destPath,
    true
  );
  const scriptName = getScriptName(
    packageJson,
    typeof scriptNames === 'string' ? [scriptNames] : scriptNames
  );
  if (!scriptName) return false;

  client.output.debug('Running user script...');
  const runScriptTime = Date.now();

  const opts: any = { cwd: destPath, ...spawnOpts };
  const env = (opts.env = { ...process.env, ...opts.env });

  if (cliType === 'npm') {
    opts.prettyCommand = `npm run ${scriptName}`;

    if (typeof lockfileVersion === 'number' && lockfileVersion >= 2) {
      // Ensure that npm 7 is at the beginning of the `$PATH`
      env.PATH = `/node16/bin-npm7:${env.PATH}`;
    }
  } else {
    opts.prettyCommand = `yarn run ${scriptName}`;

    // Yarn v2 PnP mode may be activated, so force "node-modules" linker style
    if (!env.YARN_NODE_LINKER) {
      env.YARN_NODE_LINKER = 'node-modules';
    }
  }

  client.output.log(`Running Build Command: ${cmd(opts.prettyCommand)}\n`);
  await spawnAsync(cliType, ['run', scriptName], opts);
  client.output.print('\n'); // give it some room
  client.output.debug(`Script complete [${Date.now() - runScriptTime}ms]`);
  return true;
}

async function loadCliPlugins(client: Client, cwd: string) {
  const { packageJson } = await scanParentDirs(cwd, true);
  if (packageJson) {
    let pluginCount = 0;
    const preBuildPlugins = [];
    const buildPlugins = [];

    const deps = [
      ...Object.keys(packageJson.dependencies || {}),
      ...Object.keys(packageJson.devDependencies || {}),
    ].filter(dep => dep.startsWith(VERCEL_PLUGIN_PREFIX));

    for (let dep of deps) {
      pluginCount++;
      const resolved = require.resolve(dep, {
        paths: [cwd, process.cwd()],
      });
      let plugin;
      try {
        plugin = require(resolved);
        if (typeof plugin.preBuild === 'function') {
          preBuildPlugins.push({
            plugin,
            name: dep,
          });
        }
        if (typeof plugin.build === 'function') {
          buildPlugins.push({
            plugin,
            name: dep,
          });
        }
      } catch (error) {
        client.output.error(`Failed to import ${code(dep)}`);
        throw error;
      }
    }

    return { pluginCount, preBuildPlugins, buildPlugins };
  }
}
