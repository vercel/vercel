import { Env, LoadedEnvFiles, loadEnvConfig } from '@next/env';
import {
  execCommand,
  getScriptName,
  scanParentDirs,
  spawnAsync,
} from '@vercel/build-utils';
import fs from 'fs-extra';
import { join } from 'path';
import Client from '../util/client';
import getArgs from '../util/get-args';
import handleError from '../util/handle-error';
import { isSettingValue } from '../util/is-setting-value';
import { getCommandName } from '../util/pkg-name';
import { findFramework } from '../util/projects/find-framework';
import { VERCEL_DIR } from '../util/projects/link';
import {
  ProjectLinkAndSettings,
  readProjectSettings,
} from '../util/projects/project-settings';
import pull from './pull';

import { assert } from 'console';
import { isAbsolute } from '@sentry/utils';
import { SpawnOptions } from 'child_process';
import cmd from '../util/output/cmd';
import param from '../util/output/param';
import code from '../util/output/code';
import { Framework } from '../../../frameworks/dist/types';

const help = () => {
  // @todo help output
  return console.log('vercel build');
};

const OUTPUT_DIR = '.output';
const VERCEL_PLUGIN_PREFIX = 'vercel-plugin-';

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
  client.output.print(getCommandName('build') + '\n');
  const buildState = new BuildState(cwd, client, project!);

  // Load the environment
  await buildState.loadEnv(false);

  buildState.renderConfig();

  const spawnOpts = {
    env: buildState.combinedEnv,
  };

  process.chdir(buildState.cwd);

  const plugins = await loadCliPlugins(buildState.cwd);
  if (plugins) {
    client.output.log(`Found ${plugins.length} plugin(s)`);
    for (let item of plugins) {
      const { name, plugin } = item;
      if (typeof plugin.preBuild === 'function') {
        client.output.log(`Running ${code(name + '.preBuild')}`);
        try {
          await plugin.preBuild();
        } catch (error) {
          client.output.error(`${code(name + '.preBuild')} failed`);
          handleError(error);
          return 1;
        }
      }
    }
  }

  let result: boolean;
  if (typeof buildState.buildCommand?.value === 'string') {
    buildState.client.output.log(
      `Running ${cmd(buildState.buildCommand.value)} (${
        buildState.buildCommand.source == BuildStateSource.DASHBOARD
          ? 'project settings'
          : 'package.json'
      })\n`
    );

    result = await execCommand(buildState.buildCommand.value, {
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
        buildState.buildCommand?.value || 'vercel-build' || 'build'
      )}" script in ${param(buildState.cwd)}"\n`
    );
    return 1;
  }

  client.output.log(
    `Moving output from ${param(
      buildState.outputDirectory?.value || '.next'
    )} to ${param(OUTPUT_DIR)}`
  );
  if (typeof buildState.outputDirectory?.value !== 'string') {
    client.output.error(
      `Could not determine output directory. Please run ${getCommandName(
        'pull'
      )}.\n`
    );
    return 1;
  }

  // Move to .output
  await fs.remove(join(cwd, OUTPUT_DIR));
  await fs.move(
    join(cwd, buildState.outputDirectory.value),
    join(cwd, OUTPUT_DIR)
  );

  client.output.log(
    `Moved ${param(buildState.outputDirectory.value || '.next')} to ${param(
      OUTPUT_DIR
    )}`
  );

  // Plugins
  if (plugins) {
    for (let item of plugins) {
      const { name, plugin } = item;
      if (typeof plugin.build === 'function') {
        client.output.log(`Running ${code(name + '.build')}`);
        try {
          await plugin.build();
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

export enum BuildStateSource {
  DEFAULT,
  DASHBOARD,
}

export interface BuildStateRecord {
  value: string | null;
  source: BuildStateSource;
}

export class BuildState {
  // Current working directory
  cwd: string;
  // Vercel client
  client: Client;

  framework?: Framework;

  // Output directory
  outputDirectory?: BuildStateRecord;
  // Build command
  buildCommand?: BuildStateRecord;
  // Root directory
  rootDirectory?: BuildStateRecord;
  // Combined environment variables
  combinedEnv?: Env;
  // Loaded .env files
  loadedEnvFiles?: LoadedEnvFiles;
  // Project Link + settings
  project: ProjectLinkAndSettings;

  constructor(cwd: string, client: Client, project: ProjectLinkAndSettings) {
    this.cwd = cwd;
    this.client = client;
    this.project = project;

    if (typeof project.settings.rootDirectory === 'string') {
      this.setCwd(join(cwd, project.settings.rootDirectory));
      this.setRootDirectory(
        project.settings.rootDirectory,
        BuildStateSource.DASHBOARD
      );
    } else {
      this.setRootDirectory(null, BuildStateSource.DEFAULT);
    }

    this.framework = findFramework(project.settings.framework);

    let buildCommand = project.settings.buildCommand;

    if (typeof buildCommand === 'string') {
      this.setBuildCommand(buildCommand, BuildStateSource.DASHBOARD);
    } else if (this.framework) {
      const defaults = this.framework.settings.buildCommand;
      if (isSettingValue(defaults)) {
        buildCommand = defaults.value;
        this.setBuildCommand(buildCommand, BuildStateSource.DEFAULT);
      } else {
        this.setBuildCommand(null, BuildStateSource.DEFAULT);
      }
    }

    let outputDirectory = project.settings.outputDirectory;
    if (typeof outputDirectory === 'string') {
      this.setOutputDirectory(outputDirectory, BuildStateSource.DASHBOARD);
    } else if (this.framework) {
      const defaults = this.framework.settings.outputDirectory;
      if (isSettingValue(defaults)) {
        outputDirectory = defaults.value;
        this.setOutputDirectory(outputDirectory, BuildStateSource.DEFAULT);
      } else {
        // the default output directory is actually .next
        // @todo need to handle Other which is `public` if it exists or `.`
        this.setOutputDirectory('.next', BuildStateSource.DEFAULT);
      }
    }
  }

  setCwd(cwd: string) {
    this.cwd = cwd;
  }

  setBuildCommand(value: BuildStateRecord['value'], source: BuildStateSource) {
    this.buildCommand = {
      source,
      value,
    };
  }

  setOutputDirectory(
    value: BuildStateRecord['value'],
    source: BuildStateSource
  ) {
    this.outputDirectory = {
      source,
      value,
    };
  }

  setRootDirectory(value: BuildStateRecord['value'], source: BuildStateSource) {
    this.rootDirectory = {
      source,
      value,
    };
  }

  async loadEnv(dev: boolean = false) {
    const { combinedEnv, loadedEnvFiles } = await loadEnvConfig(this.cwd, dev);
    this.combinedEnv = { ...combinedEnv, VERCEL: '1' };
    this.loadedEnvFiles = loadedEnvFiles;
  }

  // print config pretty prints the build state, it's goal is to remove
  // imperative logging/printing throughout the `main` function
  renderConfig() {
    if (this.framework) {
      this.client.output.log(
        `Framework preset: ${param(this.framework.name)} (project settings)`
      );
    }

    if (typeof this.outputDirectory?.value === 'string') {
      this.client.output.log(
        `Output directory: ${param(this.outputDirectory.value)} (${
          this.outputDirectory.source == BuildStateSource.DASHBOARD
            ? 'project settings'
            : 'framework default'
        })`
      );
    }

    if (typeof this.rootDirectory?.value === 'string') {
      this.client.output.log(
        `Root directory: ${param(this.rootDirectory.value)} (${
          this.rootDirectory.source == BuildStateSource.DASHBOARD
            ? 'project settings'
            : 'default'
        })`
      );
    }

    this.client.output.log(
      `Build command: ${param(
        this.buildCommand?.value ||
          this.framework?.settings.buildCommand.placeholder ||
          ''
      )} (${
        this.buildCommand?.source == BuildStateSource.DASHBOARD
          ? 'project settings'
          : 'default'
      })`
    );
  }
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

  client.output.log(`Running ${cmd(opts.prettyCommand)} (package.json)\n`);
  await spawnAsync(cliType, ['run', scriptName], opts);
  client.output.print('\n'); // give it some room
  client.output.debug(`Script complete [${Date.now() - runScriptTime}ms]`);
  return true;
}

async function loadCliPlugins(cwd: string) {
  const { packageJson } = await scanParentDirs(cwd, true);
  if (packageJson) {
    const plugins = [];
    const deps = [
      ...Object.keys(packageJson.dependencies || {}),
      ...Object.keys(packageJson.devDependencies || {}),
    ].filter(dep => dep.startsWith(VERCEL_PLUGIN_PREFIX));

    for (let dep of deps) {
      const resolved = require.resolve(dep, {
        paths: [cwd, process.cwd()],
      });
      plugins.push({
        plugin: require(resolved),
        name: dep,
      });
    }

    return plugins;
  }
}
