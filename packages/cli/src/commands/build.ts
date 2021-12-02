import { loadEnvConfig, processEnv } from '@next/env';
import {
  execCommand,
  getScriptName,
  GlobOptions,
  scanParentDirs,
  spawnAsync,
  glob as buildUtilsGlob,
} from '@vercel/build-utils';
import { nodeFileTrace } from '@vercel/nft';
import Sema from 'async-sema';
import chalk from 'chalk';
import { SpawnOptions } from 'child_process';
import { assert } from 'console';
import { createHash } from 'crypto';
import fs from 'fs-extra';
import ogGlob from 'glob';
import { dirname, isAbsolute, join, parse, relative, resolve } from 'path';
import pluralize from 'pluralize';
import Client from '../util/client';
import { VercelConfig } from '../util/dev/types';
import { emoji, prependEmoji } from '../util/emoji';
import getArgs from '../util/get-args';
import handleError from '../util/handle-error';
import confirm from '../util/input/confirm';
import { isSettingValue } from '../util/is-setting-value';
import cmd from '../util/output/cmd';
import logo from '../util/output/logo';
import param from '../util/output/param';
import stamp from '../util/output/stamp';
import { getCommandName, getPkgName } from '../util/pkg-name';
import { loadCliPlugins } from '../util/plugins';
import { findFramework } from '../util/projects/find-framework';
import { VERCEL_DIR } from '../util/projects/link';
import { readProjectSettings } from '../util/projects/project-settings';
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

export default async function main(client: Client) {
  if (process.env.__VERCEL_BUILD_RUNNING) {
    client.output.error(
      `${cmd(
        `${getPkgName()} build`
      )} must not recursively invoke itself. Check the Build Command in the Project Settings or the ${cmd(
        'build'
      )} script in ${cmd('package.json')}`
    );
    client.output.error(
      `Learn More: https://vercel.link/recursive-invocation-of-commands`
    );
    return 1;
  } else {
    process.env.__VERCEL_BUILD_RUNNING = '1';
  }

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

  // If `rootDirectory` exists, then `baseDir` will be the repo's root directory.
  const baseDir = cwd;

  cwd = project.settings.rootDirectory
    ? join(cwd, project.settings.rootDirectory)
    : cwd;

  // Load the environment
  const { combinedEnv, loadedEnvFiles } = loadEnvConfig(cwd, false, {
    info: () => ({}), // we don't want to log this yet.
    error: (...args: any[]) => client.output.error(args.join(' ')),
  });

  // Set process.env with loaded environment variables
  processEnv(loadedEnvFiles);

  const spawnOpts: {
    env: Record<string, string | undefined>;
  } = {
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
  const formatSetting = (
    name: string,
    override: string | null | undefined,
    defaults: typeof framework.settings.outputDirectory
  ) =>
    `  - ${chalk.bold(`${name}:`)} ${`${
      override
        ? override + ` (override)`
        : 'placeholder' in defaults
        ? chalk.italic(`${defaults.placeholder}`)
        : defaults.value
    }`}`;
  console.log(`Retrieved Project Settings:`);
  console.log(
    chalk.dim(`  - ${chalk.bold(`Framework Preset:`)} ${framework.name}`)
  );
  console.log(
    chalk.dim(
      formatSetting(
        'Build Command',
        project.settings.buildCommand,
        framework.settings.buildCommand
      )
    )
  );
  console.log(
    chalk.dim(
      formatSetting(
        'Output Directory',
        project.settings.outputDirectory,
        framework.settings.outputDirectory
      )
    )
  );

  buildState.outputDirectory =
    project.settings.outputDirectory ||
    (isSettingValue(framework.settings.outputDirectory)
      ? framework.settings.outputDirectory.value
      : null);
  buildState.rootDirectory = project.settings.rootDirectory;

  if (loadedEnvFiles.length > 0) {
    console.log(
      `Loaded Environment Variables from ${loadedEnvFiles.length} ${pluralize(
        'file',
        loadedEnvFiles.length
      )}:`
    );
    for (let envFile of loadedEnvFiles) {
      console.log(chalk.dim(`  - ${envFile.path}`));
    }
  }

  // Load plugins
  const debug = argv['--debug'];
  let plugins;
  try {
    plugins = await loadCliPlugins(cwd, client.output);
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
    console.log(
      `Loaded ${plugins.pluginCount} CLI ${pluralize(
        'Plugin',
        plugins.pluginCount
      )}`
    );
    // preBuild Plugins
    if (plugins.preBuildPlugins.length > 0) {
      console.log(
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

  if (framework && process.env.VERCEL_URL && 'envPrefix' in framework) {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('VERCEL_')) {
        const newKey = `${framework.envPrefix}${key}`;
        // Set `process.env` and `spawnOpts.env` to make sure the variables are
        // available to the `build` step and the CLI Plugins.
        process.env[newKey] = process.env[newKey] || process.env[key];
        spawnOpts.env[newKey] = process.env[newKey];
      }
    }
  }

  // Required for Next.js to produce the correct `.nft.json` files.
  spawnOpts.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT = baseDir;

  // Yarn v2 PnP mode may be activated, so force
  // "node-modules" linker style
  const env = {
    YARN_NODE_LINKER: 'node-modules',
    ...spawnOpts.env,
  };

  if (typeof buildState.buildCommand === 'string') {
    console.log(`Running Build Command: ${cmd(buildState.buildCommand)}`);
    await execCommand(buildState.buildCommand, {
      ...spawnOpts,
      env,
      cwd,
    });
  } else if (fs.existsSync(join(cwd, 'package.json'))) {
    await runPackageJsonScript(
      client,
      cwd,
      ['vercel-build', 'now-build', 'build'],
      spawnOpts
    );
  } else if (typeof framework.settings.buildCommand.value === 'string') {
    console.log(
      `Running Build Command: ${cmd(framework.settings.buildCommand.value)}`
    );
    await execCommand(framework.settings.buildCommand.value, {
      ...spawnOpts,
      env,
      cwd,
    });
  }

  if (!fs.existsSync(join(cwd, OUTPUT_DIR))) {
    let dotNextDir: string | null = null;

    // If a custom `outputDirectory` was set, we'll need to verify
    // if it's `.next` output, or just static output.
    const userOutputDirectory = project.settings.outputDirectory;

    if (typeof userOutputDirectory === 'string') {
      if (fs.existsSync(join(cwd, userOutputDirectory, 'BUILD_ID'))) {
        dotNextDir = join(cwd, userOutputDirectory);
        client.output.debug(
          `Consider ${param(userOutputDirectory)} as ${param('.next')} output.`
        );
      }
    } else if (fs.existsSync(join(cwd, '.next'))) {
      dotNextDir = join(cwd, '.next');
      client.output.debug(`Found ${param('.next')} directory.`);
    }

    // We cannot rely on the `framework` alone, as it might be a static export,
    // and the current build might use a differnt project that's not in the settings.
    const isNextOutput = Boolean(dotNextDir);
    const nextExport = dotNextDir
      ? await getNextExportStatus(dotNextDir)
      : null;
    const outputDir =
      isNextOutput && !nextExport ? OUTPUT_DIR : join(OUTPUT_DIR, 'static');
    const distDir =
      (nextExport?.exportDetail.outDirectory
        ? relative(cwd, nextExport.exportDetail.outDirectory)
        : false) ||
      dotNextDir ||
      userOutputDirectory ||
      (await framework.getFsOutputDir(cwd));

    await fs.ensureDir(join(cwd, outputDir));

    const copyStamp = stamp();
    client.output.spinner(
      `Copying files from ${param(distDir)} to ${param(outputDir)}`
    );
    const files = await glob(join(relative(cwd, distDir), '**'), {
      ignore: [
        'node_modules/**',
        '.vercel/**',
        '.env',
        '.env.*',
        '.*ignore',
        '_middleware.ts',
        '_middleware.mts',
        '_middleware.cts',
        '_middleware.mjs',
        '_middleware.cjs',
        '_middleware.js',
        'api/**',
        '.git/**',
        '.next/cache/**',
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
    console.log(
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
        version: 1,
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

    // Special Next.js processing.
    if (dotNextDir && nextExport) {
      client.output.debug('Found `next export` output.');

      const htmlFiles = await buildUtilsGlob(
        '**/*.html',
        join(cwd, OUTPUT_DIR, 'static')
      );

      if (nextExport.exportDetail.success !== true) {
        client.output.error(
          `Export of Next.js app failed. Please check your build logs.`
        );
        process.exit(1);
      }

      await fs.mkdirp(join(cwd, OUTPUT_DIR, 'server', 'pages'));
      await fs.mkdirp(join(cwd, OUTPUT_DIR, 'static'));

      await Promise.all(
        Object.keys(htmlFiles).map(async fileName => {
          await sema.acquire();

          const input = join(cwd, OUTPUT_DIR, 'static', fileName);
          const target = join(cwd, OUTPUT_DIR, 'server', 'pages', fileName);

          await fs.mkdirp(dirname(target));

          await fs.promises.rename(input, target).finally(() => {
            sema.release();
          });
        })
      );

      for (const file of [
        'BUILD_ID',
        'images-manifest.json',
        'routes-manifest.json',
        'build-manifest.json',
      ]) {
        await smartCopy(client, join(dotNextDir, file), join(OUTPUT_DIR, file));
      }
    } else if (isNextOutput) {
      // The contents of `.output/static` should be placed inside of `.output/static/_next/static`
      const tempStatic = '___static';
      await fs.rename(
        join(cwd, OUTPUT_DIR, 'static'),
        join(cwd, OUTPUT_DIR, tempStatic)
      );
      await fs.mkdirp(join(cwd, OUTPUT_DIR, 'static', '_next', 'static'));
      await fs.rename(
        join(cwd, OUTPUT_DIR, tempStatic),
        join(cwd, OUTPUT_DIR, 'static', '_next', 'static')
      );

      // Next.js might reference files from the `static` directory in `middleware-manifest.json`.
      // Since we move all files from `static` to `static/_next/static`, we'll need to change
      // those references as well and update the manifest file.
      const middlewareManifest = join(
        cwd,
        OUTPUT_DIR,
        'server',
        'middleware-manifest.json'
      );
      if (fs.existsSync(middlewareManifest)) {
        const manifest = await fs.readJSON(middlewareManifest);
        Object.keys(manifest.middleware).forEach(key => {
          const files = manifest.middleware[key].files.map((f: string) => {
            if (f.startsWith('static/')) {
              const next = f.replace(/^static\//gm, 'static/_next/static/');
              client.output.debug(
                `Replacing file in \`middleware-manifest.json\`: ${f} => ${next}`
              );
              return next;
            }

            return f;
          });

          manifest.middleware[key].files = files;
        });

        await fs.writeJSON(middlewareManifest, manifest);
      }

      // We want to pick up directories for user-provided static files into `.`output/static`.
      // More specifically, the static directory contents would then be mounted to `output/static/static`,
      // and the public directory contents would be mounted to `output/static`. Old Next.js versions
      // allow `static`, and newer ones allow both, but since there's nobody that actually uses both,
      // we can check for the existence of both and pick the first match that we find (first
      // `public`, then`static`). We can't read both at the same time because that would mean we'd
      // read public for old Next.js versions that don't support it, which might be breaking (and
      // we don't want to make vercel build specific framework versions).
      const nextSrcDirectory = dirname(distDir);

      const publicFiles = await glob('public/**', {
        nodir: true,
        dot: true,
        cwd: nextSrcDirectory,
        absolute: true,
      });
      if (publicFiles.length > 0) {
        await Promise.all(
          publicFiles.map(f =>
            smartCopy(
              client,
              f,
              join(
                OUTPUT_DIR,
                'static',
                relative(join(dirname(distDir), 'public'), f)
              )
            )
          )
        );
      } else {
        const staticFiles = await glob('static/**', {
          nodir: true,
          dot: true,
          cwd: nextSrcDirectory,
          absolute: true,
        });
        await Promise.all(
          staticFiles.map(f =>
            smartCopy(
              client,
              f,
              join(
                OUTPUT_DIR,
                'static',
                'static',
                relative(join(dirname(distDir), 'static'), f)
              )
            )
          )
        );
      }

      // Regardless of the Next.js version, we make sure that it is compatible with
      // the Filesystem API. We get there by  moving all the files needed
      // into the outputs directory `inputs` folder.  Next.js is > 12, we can
      // read the .nft.json files directly. If there aren't .nft.json files
      // we trace and create them. We then resolve the files in each nft file list
      // and move them into the "inputs" directory. We rename them with hashes to
      // prevent collisions and then update the related .nft files accordingly
      // to point to the newly named input files. Again, all of this is so that Next.js
      // works with the Filesystem API (and so .output contains all inputs
      // needed to run Next.js) and `vc --prebuilt`.
      const nftFiles = await glob(join(OUTPUT_DIR, '**', '*.nft.json'), {
        nodir: true,
        dot: true,
        ignore: ['cache/**'],
        cwd,
        absolute: true,
      });

      // If there are no .nft.json files, we know that Next.js < 12. We then
      // execute the tracing on our own.
      if (nftFiles.length === 0) {
        const serverFiles = await glob(
          join(OUTPUT_DIR, 'server', 'pages', '**', '*.js'),
          {
            nodir: true,
            dot: true,
            cwd,
            ignore: ['webpack-runtime.js'],
            absolute: true,
          }
        );
        for (let f of serverFiles) {
          const { ext, dir } = parse(f);
          const { fileList } = await nodeFileTrace([f], {
            ignore: [
              relative(cwd, f),
              'node_modules/next/dist/pages/**/*',
              'node_modules/next/dist/compiled/webpack/(bundle4|bundle5).js',
              'node_modules/react/**/*.development.js',
              'node_modules/react-dom/**/*.development.js',
              'node_modules/use-subscription/**/*.development.js',
              'node_modules/sharp/**/*',
            ],
          });
          fileList.delete(relative(cwd, f));
          await resolveNftToOutput({
            client,
            baseDir,
            outputDir: OUTPUT_DIR,
            nftFileName: f.replace(ext, '.js.nft.json'),
            distDir,
            nft: {
              version: 1,
              files: Array.from(fileList).map(fileListEntry =>
                relative(dir, fileListEntry)
              ),
            },
          });
        }
      } else {
        for (let f of nftFiles) {
          const json = await fs.readJson(f);
          await resolveNftToOutput({
            client,
            baseDir,
            outputDir: OUTPUT_DIR,
            nftFileName: f,
            nft: json,
            distDir,
          });
        }
      }

      const requiredServerFilesPath = join(
        OUTPUT_DIR,
        'required-server-files.json'
      );

      if (fs.existsSync(requiredServerFilesPath)) {
        client.output.debug(`Resolve ${param('required-server-files.json')}.`);

        const requiredServerFilesJson = await fs.readJSON(
          requiredServerFilesPath
        );

        await fs.writeJSON(requiredServerFilesPath, {
          ...requiredServerFilesJson,
          appDir: '.',
          files: requiredServerFilesJson.files.map((i: string) => {
            const originalPath = join(requiredServerFilesJson.appDir, i);
            const relPath = join(OUTPUT_DIR, relative(distDir, originalPath));

            const absolutePath = join(cwd, relPath);
            const output = relative(baseDir, absolutePath);

            return relPath === output
              ? relPath
              : {
                  input: relPath,
                  output,
                };
          }),
        });
      }
    }
  }

  // Build Plugins
  if (plugins?.buildPlugins && plugins.buildPlugins.length > 0) {
    console.log(
      `Running ${plugins.pluginCount} CLI ${pluralize(
        'Plugin',
        plugins.pluginCount
      )} after Build Command:`
    );
    let vercelConfig: VercelConfig = {};
    try {
      vercelConfig = await fs.readJSON(join(cwd, 'vercel.json'));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(`Failed to read vercel.json: ${error.message}`);
      }
    }
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
          await plugin.build({
            vercelConfig,
            workPath: cwd,
          });
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

  console.log(
    `${prependEmoji(
      `Build Completed in ${chalk.bold(OUTPUT_DIR)} ${chalk.gray(
        buildStamp()
      )}`,
      emoji('success')
    )}`
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

  console.log(`Running Build Command: ${cmd(opts.prettyCommand)}\n`);
  await spawnAsync(cliType, ['run', scriptName], opts);
  console.log(); // give it some room
  client.output.debug(`Script complete [${Date.now() - runScriptTime}ms]`);
  return true;
}

async function linkOrCopy(existingPath: string, newPath: string) {
  try {
    if (
      newPath.endsWith('.nft.json') ||
      newPath.endsWith('middleware-manifest.json') ||
      newPath.endsWith('required-server-files.json')
    ) {
      await fs.copy(existingPath, newPath, {
        overwrite: true,
      });
    } else {
      await fs.createLink(existingPath, newPath);
    }
  } catch (err: any) {
    // eslint-disable-line
    // If a symlink to the same file already exists
    // then trying to copy it will make an empty file from it.
    if (err['code'] === 'EEXIST') return;
    // In some VERY rare cases (1 in a thousand), symlink creation fails on Windows.
    // In that case, we just fall back to copying.
    // This issue is reproducible with "pnpm add @material-ui/icons@4.9.1"
    await fs.copy(existingPath, newPath, {
      overwrite: true,
    });
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

interface NftFile {
  version: number;
  files: (string | { input: string; output: string })[];
}

// resolveNftToOutput takes nft file and moves all of its trace files
// into the specified directory + `inputs`, (renaming them to their hash + ext) and
// subsequently updating the original nft file accordingly. This is done
// to make the `.output` directory be self-contained, so that it works
// properly with `vc --prebuilt`.
async function resolveNftToOutput({
  client,
  baseDir,
  outputDir,
  nftFileName,
  distDir,
  nft,
}: {
  client: Client;
  baseDir: string;
  outputDir: string;
  nftFileName: string;
  distDir: string;
  nft: NftFile;
}) {
  client.output.debug(`Processing and resolving ${nftFileName}`);
  await fs.ensureDir(join(outputDir, 'inputs'));
  const newFilesList: NftFile['files'] = [];

  // If `distDir` is a subdirectory, then the input has to be resolved to where the `.output` directory will be.
  const relNftFileName = relative(outputDir, nftFileName);
  const origNftFilename = join(distDir, relNftFileName);

  if (relNftFileName.startsWith('cache/')) {
    // No need to process the `cache/` directory.
    // Paths in it might also not be relative to `cache` itself.
    return;
  }

  for (let fileEntity of nft.files) {
    const relativeInput =
      typeof fileEntity === 'string' ? fileEntity : fileEntity.input;
    const fullInput = resolve(join(parse(origNftFilename).dir, relativeInput));

    // if the resolved path is NOT in the .output directory we move in it there
    if (!fullInput.includes(distDir)) {
      const { ext } = parse(fullInput);
      const raw = await fs.readFile(fullInput);
      const newFilePath = join(outputDir, 'inputs', hash(raw) + ext);
      smartCopy(client, fullInput, newFilePath);

      // We have to use `baseDir` instead of `cwd`, because we want to
      // mount everything from there (especially `node_modules`).
      // This is important for NPM Workspaces where `node_modules` is not
      // in the directory of the workspace.
      const output = relative(baseDir, fullInput).replace('.output', '.next');

      newFilesList.push({
        input: relative(parse(nftFileName).dir, newFilePath),
        output,
      });
    } else {
      newFilesList.push(relativeInput);
    }
  }
  // Update the .nft.json with new input and output mapping
  await fs.writeJSON(nftFileName, {
    ...nft,
    files: newFilesList,
  });
}

/**
 * Files will only exist when `next export` was used.
 */
async function getNextExportStatus(dotNextDir: string) {
  const exportDetail: {
    success: boolean;
    outDirectory: string;
  } | null = await fs
    .readJson(join(dotNextDir, 'export-detail.json'))
    .catch(error => {
      if (error.code === 'ENOENT') {
        return null;
      }

      throw error;
    });

  if (!exportDetail) {
    return null;
  }

  const exportMarker: {
    version: 1;
    exportTrailingSlash: boolean;
    hasExportPathMap: boolean;
  } | null = await fs
    .readJSON(join(dotNextDir, 'export-marker.json'))
    .catch(error => {
      if (error.code === 'ENOENT') {
        return null;
      }

      throw error;
    });

  return {
    exportDetail,
    exportMarker: {
      trailingSlash: exportMarker?.hasExportPathMap
        ? exportMarker.exportTrailingSlash
        : false,
    },
  };
}
