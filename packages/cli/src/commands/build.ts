import { loadEnvConfig, processEnv } from '@next/env';
import {
  execCommand,
  getScriptName,
  GlobOptions,
  scanParentDirs,
  spawnAsync,
} from '@vercel/build-utils';
import { nodeFileTrace } from '@vercel/nft';
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
import logo from '../util/output/logo';
import param from '../util/output/param';
import stamp from '../util/output/stamp';
import { getCommandName, getPkgName } from '../util/pkg-name';
import { loadCliPlugins } from '../util/plugins';
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

const fields: {
  name: string;
  value: keyof ProjectLinkAndSettings['settings'];
}[] = [
  { name: 'Build Command', value: 'buildCommand' },
  { name: 'Output Directory', value: 'outputDirectory' },
  { name: 'Root Directory', value: 'rootDirectory' },
];

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

  console.log(`Retrieved Project Settings:`);
  console.log(
    chalk.dim(`  - ${chalk.bold(`Framework Preset:`)} ${framework.name}`)
  );

  for (let field of fields) {
    const defaults = (framework.settings as any)[field.value];
    if (defaults) {
      console.log(
        chalk.dim(
          `  - ${chalk.bold(`${field.name}:`)} ${`${
            project.settings[field.value]
              ? project.settings[field.value] + ` (override)`
              : isSettingValue(defaults)
              ? defaults.value
              : chalk.italic(`${defaults.placeholder}`)
          }`}`
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

  if (typeof buildState.buildCommand === 'string') {
    console.log(`Running Build Command: ${cmd(buildState.buildCommand)}`);
    await execCommand(buildState.buildCommand, {
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
    await runPackageJsonScript(
      client,
      cwd,
      ['vercel-build', 'now-build', 'build'],
      spawnOpts
    );
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
    if (framework.slug === 'nextjs') {
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
      const publicFiles = await glob('public/**', {
        nodir: true,
        dot: true,
        cwd,
        absolute: true,
      });
      if (publicFiles.length > 0) {
        await Promise.all(
          publicFiles.map(f =>
            smartCopy(
              client,
              f,
              f.replace('public', join(OUTPUT_DIR, 'static'))
            )
          )
        );
      } else {
        const staticFiles = await glob('static/**', {
          nodir: true,
          dot: true,
          cwd,
          absolute: true,
        });
        await Promise.all(
          staticFiles.map(f =>
            smartCopy(
              client,
              f,
              f.replace('static', join(OUTPUT_DIR, 'static', 'static'))
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
          });
        }
      }

      const requiredServerFilesPath = join(
        OUTPUT_DIR,
        'required-server-files.json'
      );
      const requiredServerFilesJson = await fs.readJSON(
        requiredServerFilesPath
      );
      await fs.writeJSON(requiredServerFilesPath, {
        ...requiredServerFilesJson,
        appDir: '.',
        files: requiredServerFilesJson.files.map((i: string) => {
          const absolutePath = join(cwd, i.replace('.next', '.output'));
          const output = relative(baseDir, absolutePath);

          return {
            input: i.replace('.next', '.output'),
            output,
          };
        }),
      });
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
  nft,
}: {
  client: Client;
  baseDir: string;
  outputDir: string;
  nftFileName: string;
  nft: NftFile;
}) {
  client.output.debug(`Processing and resolving ${nftFileName}`);
  await fs.ensureDir(join(outputDir, 'inputs'));
  const newFilesList: NftFile['files'] = [];
  for (let fileEntity of nft.files) {
    const relativeInput: string =
      typeof fileEntity === 'string' ? fileEntity : fileEntity.input;
    const fullInput = resolve(join(parse(nftFileName).dir, relativeInput));

    // if the resolved path is NOT in the .output directory we move in it there
    if (!fullInput.includes(outputDir)) {
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
