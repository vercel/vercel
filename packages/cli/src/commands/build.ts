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
import { createHash } from 'crypto';
import fs from 'fs-extra';
import ogGlob from 'glob';
import { isAbsolute, join, parse, relative, resolve } from 'path';
import pluralize from 'pluralize';
import Client from '../util/client';
import { emoji, prependEmoji } from '../util/emoji';
import getArgs from '../util/get-args';
import handleError from '../util/handle-error';
import confirm from '../util/input/confirm';
import { isSettingValue } from '../util/is-setting-value';
import cmd from '../util/output/cmd';
import code from '../util/output/code';
import { getColorForPkgName } from '../util/output/color-name-cache';
import logo from '../util/output/logo';
import param from '../util/output/param';
import stamp from '../util/output/stamp';
import cliPkgJson from '../util/pkg';
import { getCommandName, getPkgName } from '../util/pkg-name';
import { findFramework } from '../util/projects/find-framework';
import { VERCEL_DIR } from '../util/projects/link';
import {
  ProjectLinkAndSettings,
  readProjectSettings,
} from '../util/projects/project-settings';
import pull from './pull';

const sema = new Sema(16, {
  capacity: 100,
});

const help = () => {
  return console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} build`)}

 ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory
    --cwd [path]                   The current working directory
    -d, --debug                    Debug mode [off]
    -y, --yes                      Skip the confirmation prompt

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Build the project

    ${chalk.cyan(`$ ${getPkgName()} build`)}
    ${chalk.cyan(`$ ${getPkgName()} build --cwd ./path-to-project`)}    
`);
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
];

export default async function main(client: Client) {
  let argv;
  const buildStamp = stamp();
  try {
    argv = getArgs(client.argv.slice(2), {
      '--debug': Boolean,
      '--cwd': String,
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  let cwd = argv['--cwd'] || process.cwd();

  let project = await readProjectSettings(join(cwd, VERCEL_DIR));
  // If there are no project settings, only then do we pull them down
  while (!project?.settings) {
    const confirmed = await confirm(
      `No Project Settings found locally. Run ${getCommandName(
        'pull'
      )} for retrieving them?`,
      true
    );
    if (!confirmed) {
      client.output.print(`Aborted. No Project Settings retrieved.\n`);
      return 0;
    }
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

  const origLog = console.log;
  const origErr = console.error;
  const prefixedLog = (
    prefix: string,
    args: any[],
    logger: (...args: any[]) => void
  ) => {
    if (typeof args[0] === 'string') {
      args[0] = `${prefix} ${args[0]}`;
    } else {
      args.unshift(prefix);
    }
    return logger(...args);
  };

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
            console.log = (...args: any[]) =>
              prefixedLog(prefix, args, origLog);
            console.error = (...args: any[]) =>
              prefixedLog(prefix, args, origErr);
            await plugin.preBuild();
            client.output.debug(
              `Completed ${fullName} ${chalk.dim(`${pluginStamp()}`)}`
            );
          } catch (error) {
            client.output.error(`${prefix} failed`);
            handleError(error, { debug });
            return 1;
          } finally {
            console.log = origLog;
            console.error = origErr;
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
  } else if (fs.existsSync(join(cwd, 'package.json'))) {
    result = await runPackageJsonScript(
      client,
      cwd,
      ['vercel-build', 'now-build', 'build'],
      spawnOpts
    );
  } else {
    // no package.json exists and no build command present
    result = true;
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
        'node_modules/**',
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
      const buildManifest = {
        cache: framework.cachePattern ? [framework.cachePattern] : [],
      };
      await fs.writeJSON(buildManifestPath, buildManifest, { spaces: 2 });
    }

    if (!fs.existsSync(routesManifestPath)) {
      client.output.debug(
        `Generating routes manifest: ${param(routesManifestPath)}`
      );
      const routesManifest = {
        version: 3,
        pages404: true,
        basePath: '',
        redirects: framework.defaultRedirects ?? [],
        headers: framework.defaultHeaders ?? [],
        dynamicRoutes: [],
        dataRoutes: [],
        rewrites: framework.defaultRewrites ?? [],
      };
      await fs.writeJSON(
        join(cwd, OUTPUT_DIR, 'routes-manifest.json'),
        routesManifest,
        { spaces: 2 }
      );
    }
  }

  if (framework.slug === 'nextjs') {
    const files = await glob(join(OUTPUT_DIR, '**', '*.nft.json'), {
      nodir: true,
      dot: true,
      cwd,
      absolute: true,
    });
    await fs.mkdirp(join(cwd, OUTPUT_DIR, 'inputs'));
    for (let f of files) {
      client.output.debug(`Processing ${f}:`);
      const json = await fs.readJson(f);
      const newFilesList: Array<{ input: string; output: string }> = [];
      for (let fileEntity of json.files) {
        const file =
          typeof fileEntity === 'string' ? fileEntity : fileEntity.input;
        // if the resolved path is NOT in the .output directory we move in it there
        const fullPath = resolve(parse(f).dir);
        if (!resolve(fullPath).includes(OUTPUT_DIR)) {
          const { ext } = parse(file);
          const raw = await fs.readFile(resolve(fullPath));
          const newFilePath = join(OUTPUT_DIR, 'inputs', hash(raw) + ext);
          smartCopy(client, fullPath, newFilePath);

          newFilesList.push({
            input: relative(parse(f).dir, newFilePath),
            output: file,
          });
        } else {
          newFilesList.push({
            input: file,
            output: file,
          });
        }
      }
      // Update the .nft.json with new input and output mapping
      await fs.writeJSON(f, {
        ...json,
        files: newFilesList,
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
          console.log = (...args: any[]) => prefixedLog(prefix, args, origLog);
          console.error = (...args: any[]) =>
            prefixedLog(prefix, args, origErr);
          await plugin.build();
          client.output.debug(
            `Completed ${fullName} ${chalk.dim(`${pluginStamp()}`)}`
          );
        } catch (error) {
          client.output.error(`${prefix} failed`);
          handleError(error, { debug });
          return 1;
        } finally {
          console.log = origLog;
          console.error = origLog;
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

/**
 * Computes a hash for the given buf.
 *
 * @param {Buffer} file data
 * @return {String} hex digest
 */
function hash(buf: Buffer): string {
  return createHash('sha1').update(buf).digest('hex');
}
