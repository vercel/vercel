import { Env, LoadedEnvFiles, loadEnvConfig } from '@next/env';
import { execCommand, runPackageJsonScript } from '@vercel/build-utils';
import fs from 'fs-extra';
import { join } from 'path';
import Client from '../util/client';
import getArgs from '../util/get-args';
import handleError from '../util/handle-error';
import { isSettingValue } from '../util/is-setting-value';
import { getCommandName } from '../util/pkg-name';
import { findFramework } from '../util/projects/find-framework';
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
  let project = await readProjectSettings(cwd);
  // If there are no project settings, only then do we pull them down
  while (project === null) {
    const result = await pull(client);
    if (result !== 0) {
      return result;
    }
    project = await readProjectSettings(cwd);
  }

  const buildState = new BuildState(cwd, client, project);

  // Load the environment
  await buildState.loadEnv(false);

  buildState.renderConfig();

  const spawnOpts = {
    env: buildState.combinedEnv,
  };

  let result: boolean;
  if (typeof buildState.buildCommand === 'string') {
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
      cwd,
      ['vercel-build', 'now-build', 'build'],
      spawnOpts
    );
  }

  if (!result) {
    client.output.error(
      `Missing required "${
        buildState.buildCommand || 'vercel-build' || 'build'
      }" script in "${buildState.cwd}"`
    );
    return 1;
  }

  client.output.debug(
    `Moving output from ${buildState.outputDirectory} to .output`
  );
  if (typeof buildState.outputDirectory !== 'string') {
    client.output.error(
      `Could not determine output directory. Please run ${getCommandName(
        'pull'
      )}.`
    );
    return 1;
  }

  // Move to .output
  await fs.move(join(cwd, buildState.outputDirectory), join(cwd, OUTPUT_DIR));

  client.output.print(
    `Created \`${OUTPUT_DIR}\` from \`${project.settings.outputDirectory}\` `
  );

  // Plugins

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
  // Project framework name
  frameworkName?: BuildStateRecord;
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

    const framework =
      project.settings.framework && findFramework(project.settings.framework);

    if (framework && framework.name) {
      this.setFrameworkName(framework.name, BuildStateSource.DASHBOARD);
    }

    let buildCommand = project.settings.buildCommand;

    if (typeof buildCommand === 'string') {
      this.setBuildCommand(buildCommand, BuildStateSource.DASHBOARD);
    } else if (framework) {
      const defaults = framework.settings.buildCommand;
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
    } else if (framework) {
      const defaults = framework.settings.outputDirectory;
      if (isSettingValue(defaults)) {
        outputDirectory = defaults.value;
        this.setOutputDirectory(outputDirectory, BuildStateSource.DEFAULT);
      } else {
        // the default output directory is actually .next
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

  setFrameworkName(value: BuildStateRecord['value'], source: BuildStateSource) {
    this.frameworkName = {
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
    if (typeof this.buildCommand?.value === 'string') {
      this.client.output.print(
        `Running \`${this.buildCommand.value}\` (${
          this.buildCommand.source == BuildStateSource.DASHBOARD
            ? 'dashboard'
            : 'package.json'
        })`
      );
    }

    if (typeof this.frameworkName?.value === 'string') {
      this.client.output.print(`Detected ${this.frameworkName.value}`);
    }

    if (typeof this.outputDirectory?.value === 'string') {
      this.client.output.print(
        `Output directory: \`${this.outputDirectory.value}\` (${
          this.outputDirectory.source == BuildStateSource.DASHBOARD
            ? 'dashboard'
            : 'default'
        })`
      );
    }

    if (typeof this.rootDirectory?.value === 'string') {
      this.client.output.print(
        `Root directory: \`${this.rootDirectory.value}\` (${
          this.rootDirectory.source == BuildStateSource.DASHBOARD
            ? 'dashboard'
            : 'default'
        })`
      );
    }
  }
}
