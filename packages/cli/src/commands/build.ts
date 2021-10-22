import { loadEnvConfig, processEnv } from '@next/env';
import {
  execCommand,
  getScriptName,
  GlobOptions,
  scanParentDirs,
  spawnAsync,
} from '@vercel/build-utils';
import Sema from 'async-sema';
import chalk from 'chalk';
import { SpawnOptions } from 'child_process';
import { assert } from 'console';
import fs from 'fs-extra';
import ogGlob from 'glob';
import { isAbsolute, join, relative } from 'path';
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
import cliPkgJson from '../util/pkg';
import { getColorForPkgName } from '../util/output/color-name-cache';
import { emoji, prependEmoji } from '../util/emoji';

const sema = new Sema(16, {
  capacity: 100,
});

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
  { name: 'Build Command', value: 'buildCommand' },
  { name: 'Output Directory', value: 'outputDirectory' },
  { name: 'Root Directory', value: 'rootDirectory' },
  { name: 'Development Command', value: 'devCommand' },
];

export default async function main(client: Client) {
  let argv;
  const buildStamp = stamp();
  try {
    argv = getArgs(client.argv.slice(2), {
      '--debug': Boolean,
    });
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

  // Set process.env with loaded environment variables
  await processEnv(loadedEnvFiles);

  const spawnOpts = {
    env: { ...combinedEnv, VERCEL: '1' },
  };

  process.chdir(cwd);

  const framework = findFramework(project.settings.framework);
  // If this is undefined, we bail. If it is null, then findFramework should return "Other",
  // so this should really never happen, but just in case....
  if (framework === undefined) {
    client.output.error(
      `Framework detection failed or is malformed. Please run ${getCommandName(
        'pull'
      )} again.`
    );
    return 1;
  }

  const buildState = { ...project.settings };

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
    if (field.value != 'buildCommand') {
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
  const debug = argv['--debug'];
  let plugins;
  try {
    plugins = await loadCliPlugins(client, cwd);
  } catch (error) {
    client.output.error('Failed to load CLI Plugins');
    handleError(error, { debug });
    return 1;
  }

  const tmpLog = console.log;
  const tmpErr = console.error;

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
        const { name, plugin, color } = item;
        if (typeof plugin.preBuild === 'function') {
          const pluginStamp = stamp();
          const fullName = name + '.preBuild';
          const prefix = chalk.gray('  > ') + color(fullName + ':');
          client.output.debug(`Running ${fullName}:`);
          try {
            console.log = (message?: string, ...args: any[]) =>
              tmpLog(prefix, message, ...args);
            console.error = (message?: string, ...args: any[]) =>
              tmpErr(prefix, message, ...args);
            await plugin.preBuild();
            client.output.debug(
              `Completed ${fullName} ${chalk.dim(`${pluginStamp()}`)}`
            );
          } catch (error) {
            client.output.error(`${prefix} failed`);
            handleError(error, { debug });
            return 1;
          } finally {
            console.log = (message?: string, ...args: any[]) =>
              tmpLog(message, ...args);
            console.error = (message?: string, ...args: any[]) =>
              tmpErr(message, ...args);
          }
        }
      }
    }
  }

  // Clean the output directory
  fs.removeSync(join(cwd, OUTPUT_DIR));
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

  if (!fs.existsSync(join(cwd, OUTPUT_DIR))) {
    let outputDir = join(OUTPUT_DIR, 'static');
    let distDir = await framework.getFsOutputDir(cwd);
    if (framework.slug === 'nextjs') {
      outputDir = OUTPUT_DIR;
    }
    const copyStamp = stamp();
    await fs.ensureDir(join(cwd, outputDir));
    const relativeDistDir = relative(cwd, distDir);
    client.output.spinner(
      `Copying files from ${param(distDir)} to ${param(outputDir)}`
    );
    const files = await glob(join(relativeDistDir, '**'), {
      ignore: [
        '**/node_modules/**',
        '.vercel/**',
        '_middleware.ts',
        '_middleware.mts',
        '_middleware.cts',
        '_middleware.mjs',
        '_middleware.cjs',
        '_middleware.js',
        'api/**',
        '.git/**',
      ],
      nodir: true,
      dot: true,
      cwd,
      absolute: true,
    });
    await Promise.all(
      files.map(f =>
        smartCopy(
          client,
          f,
          distDir === '.'
            ? join(cwd, outputDir, relative(cwd, f))
            : f.replace(distDir, outputDir)
        )
      )
    );
    client.output.stopSpinner();
    client.output.log(
      `Copied ${files.length.toLocaleString()} files from ${param(
        distDir
      )} to ${param(outputDir)} ${copyStamp()}`
    );

    const buildManifestPath = join(cwd, OUTPUT_DIR, 'build-manifest.json');
    const routesManifestPath = join(cwd, OUTPUT_DIR, 'routes-manifest.json');

    if (!fs.existsSync(buildManifestPath)) {
      client.output.debug(
        `Generating build manifest: ${param(buildManifestPath)}`
      );
      await fs.writeJSON(buildManifestPath, {
        cache: framework.cachePattern ? [framework.cachePattern] : [],
      });
    }

    if (!fs.existsSync(routesManifestPath)) {
      client.output.debug(
        `Generating routes manifest: ${param(routesManifestPath)}`
      );
      await fs.writeJSON(join(cwd, OUTPUT_DIR, 'routes-manifest.json'), {
        version: 3,
        pages404: true,
        basePath: '',
        redirects: framework.defaultRedirects ?? [],
        headers: framework.defaultHeaders ?? [],
        dynamicRoutes: [],
        dataRoutes: [],
        rewrites: framework.defaultRewrites ?? [],
      });
    }
  }

  // Build Plugins
  if (plugins?.buildPlugins && plugins.buildPlugins.length > 0) {
    client.output.log(
      `Running ${plugins.pluginCount} CLI ${pluralize(
        'Plugin',
        plugins.pluginCount
      )} after Build Command:`
    );
    for (let item of plugins.buildPlugins) {
      const { name, plugin, color } = item;
      if (typeof plugin.build === 'function') {
        const pluginStamp = stamp();
        const fullName = name + '.build';
        const prefix = chalk.gray('  > ') + color(fullName + ':');
        client.output.debug(`Running ${fullName}:`);
        try {
          console.log = (message?: string, ...args: any[]) =>
            tmpLog(prefix, message, ...args);
          console.error = (message?: string, ...args: any[]) =>
            tmpErr(prefix, message, ...args);
          await plugin.build();
          client.output.debug(
            `Completed ${fullName} ${chalk.dim(`${pluginStamp()}`)}`
          );
        } catch (error) {
          client.output.error(`${prefix} failed`);
          handleError(error, { debug });
          return 1;
        } finally {
          console.log = (message?: string, ...args: any[]) =>
            tmpLog(message, ...args);
          console.error = (message?: string, ...args: any[]) =>
            tmpErr(message, ...args);
        }
      }
    }
  }

  client.output.print(
    `${prependEmoji(
      `Build Completed in ${chalk.bold(OUTPUT_DIR)} ${chalk.gray(
        buildStamp()
      )}`,
      emoji('success')
    )}\n`
  );

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

  let pluginCount = 0;
  const preBuildPlugins = [];
  const buildPlugins = [];
  const deps = [
    ...Object.keys(packageJson?.dependencies || {}),
    ...Object.keys(packageJson?.devDependencies || {}),
    ...Object.keys(cliPkgJson.dependencies),
  ].filter(dep => dep.startsWith(VERCEL_PLUGIN_PREFIX));

  for (let dep of deps) {
    pluginCount++;
    const resolved = require.resolve(dep, {
      paths: [cwd, process.cwd()],
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
    } catch (error) {
      client.output.error(`Failed to import ${code(dep)}`);
      throw error;
    }
  }

  return { pluginCount, preBuildPlugins, buildPlugins };
}

async function linkOrCopy(existingPath: string, newPath: string) {
  try {
    await fs.createLink(existingPath, newPath);
  } catch (err: any) {
    // eslint-disable-line
    // If a hard link to the same file already exists
    // then trying to copy it will make an empty file from it.
    if (err['code'] === 'EEXIST') return;
    // In some VERY rare cases (1 in a thousand), hard-link creation fails on Windows.
    // In that case, we just fall back to copying.
    // This issue is reproducible with "pnpm add @material-ui/icons@4.9.1"
    await fs.copyFile(existingPath, newPath);
  }
}

async function smartCopy(client: Client, from: string, to: string) {
  sema.acquire();
  try {
    client.output.debug(`Copying from ${from} to ${to}`);
    await linkOrCopy(from, to);
  } finally {
    sema.release();
  }
}

async function glob(pattern: string, options: GlobOptions): Promise<string[]> {
  return new Promise((resolve, reject) => {
    ogGlob(pattern, options, (err, files) => {
      err ? reject(err) : resolve(files);
    });
  });
}
