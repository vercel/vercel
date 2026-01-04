import path from 'node:path';
import {
  FileFsRef,
  debug,
  download,
  glob,
  Lambda,
  type BuildOptions,
  type BuildResultV3,
  getLambdaOptionsFromFunction,
} from '@vercel/build-utils';
import execa from 'execa';
import { installRustToolchain } from './lib/rust-toolchain';
import type { Runtime } from './lib/runtime';
import {
  getCargoMetadata,
  findBinaryName,
  findCargoWorkspace,
  findCargoBuildConfiguration,
} from './lib/cargo';
import {
  assertEnv,
  getExecutableName,
  gatherExtraFiles,
  runUserScripts,
} from './lib/utils';

import { startDevServer as rustStartDevServer } from './lib/start-dev-server';

type RustEnv = Record<'RUSTFLAGS' | 'PATH', string>;

async function buildHandler(options: BuildOptions): Promise<BuildResultV3> {
  const BUILDER_DEBUG = Boolean(process.env.VERCEL_BUILDER_DEBUG ?? false);
  const isVercelBuild = Boolean(process.env.VERCEL_BUILD_IMAGE ?? false);

  const { files, entrypoint, workPath, config, meta } = options;

  // If we are not building on Vercel and we are not initiainted from `vercel dev`,
  // we are building for a prebuilt deployment, so we need to cross-compile
  const crossCompilationEnabled = !isVercelBuild && !meta?.isDev;

  await installRustToolchain();

  debug('Creating file system');
  const downloadedFiles = await download(files, workPath, meta);
  const entryPath = downloadedFiles[entrypoint].fsPath;

  const HOME =
    process.platform === 'win32' ? assertEnv('USERPROFILE') : assertEnv('HOME');
  const PATH = assertEnv('PATH');

  const rustEnv: RustEnv = {
    PATH: `${path.join(HOME, '.cargo/bin')}${path.delimiter}${PATH}`,
    RUSTFLAGS: [process.env.RUSTFLAGS].filter(Boolean).join(' '),
  };

  const cargoWorkspace = await findCargoWorkspace({
    env: rustEnv,
    cwd: path.dirname(entryPath),
  });

  const binaryName = findBinaryName(cargoWorkspace, entryPath);
  const cargoBuildConfiguration =
    await findCargoBuildConfiguration(cargoWorkspace);

  await runUserScripts(workPath);

  const extraFiles = await gatherExtraFiles(config.includeFiles, workPath);

  const lambdaOptions = await getLambdaOptionsFromFunction({
    sourceFile: entrypoint,
    config,
  });

  const architecture = lambdaOptions?.architecture || 'x86_64';

  const buildVariant = meta?.isDev ? 'debug' : 'release';
  const buildTarget = cargoBuildConfiguration?.build.target ?? '';

  try {
    // If we are not building on Vercel (it means we are building for a prebuilt deployment),
    // We cross-compile it for linux x86_64 using `zigbuild`
    const args = crossCompilationEnabled
      ? [
          'zigbuild',
          '--target',
          architecture === 'x86_64'
            ? 'x86_64-unknown-linux-gnu'
            : 'aarch64-unknown-linux-gnu',
          '--bin',
          binaryName,
        ].concat(BUILDER_DEBUG ? ['--verbose'] : ['--quiet'], ['--release'])
      : ['build', '--bin', binaryName].concat(
          BUILDER_DEBUG ? ['--verbose'] : ['--quiet'],
          meta?.isDev ? [] : ['--release']
        );

    debug(
      `Running \`cargo build\` for \`${binaryName}\` (\`${architecture}\`)`
    );
    await execa('cargo', args, {
      cwd: workPath,
      env: rustEnv,
    });
  } catch (err) {
    debug(`Running \`cargo build\` for \`${binaryName}\` failed`);
    throw err;
  }

  debug(
    `Building \`${binaryName}\` for \`${process.platform}\` (\`${architecture}\`) completed`
  );

  let { target_directory: targetDirectory } = await getCargoMetadata({
    cwd: workPath,
    env: rustEnv,
  });

  // If we are building for a prebuilt deployment, adjust the target directory to the cross compilation dir
  if (crossCompilationEnabled) {
    targetDirectory = path.join(
      targetDirectory,
      architecture === 'x86_64'
        ? 'x86_64-unknown-linux-gnu'
        : 'aarch64-unknown-linux-gnu'
    );
  }
  targetDirectory = path.join(targetDirectory, buildTarget);

  const bin = path.join(
    targetDirectory,
    buildVariant,
    getExecutableName(binaryName)
  );

  const handler = getExecutableName('executable');
  const executableFile = new FileFsRef({ mode: 0o755, fsPath: bin });
  const lambda = new Lambda({
    ...lambdaOptions,
    files: {
      ...extraFiles,
      [handler]: executableFile,
    },
    handler,
    supportsResponseStreaming: true,
    architecture,
    runtime: 'executable',
    runtimeLanguage: 'rust',
  });
  lambda.zipBuffer = await lambda.createZip();

  debug(`generating function for \`${entrypoint}\``);

  return {
    output: lambda,
  };
}

// Reference -  https://github.com/vercel/vercel/blob/main/DEVELOPING_A_RUNTIME.md#runtime-developer-reference
const runtime: Runtime = {
  version: 3,
  build: buildHandler,
  prepareCache: async ({ workPath }) => {
    debug(`Caching \`${workPath}\``);
    const cacheFiles = await glob('target/**', workPath);
    // Convert this into a reduce
    for (const f of Object.keys(cacheFiles)) {
      const accept =
        /(?:^|\/)target\/release\/\.fingerprint\//.test(f) ||
        /(?:^|\/)target\/release\/build\//.test(f) ||
        /(?:^|\/)target\/release\/deps\//.test(f) ||
        /(?:^|\/)target\/debug\/\.fingerprint\//.test(f) ||
        /(?:^|\/)target\/debug\/build\//.test(f) ||
        /(?:^|\/)target\/debug\/deps\//.test(f);
      if (!accept) {
        delete cacheFiles[f];
      }
    }
    return cacheFiles;
  },
  startDevServer: rustStartDevServer,
  shouldServe: async (options): Promise<boolean> => {
    debug(`Requested ${options.requestPath} for ${options.entrypoint}`);
    return Promise.resolve(options.requestPath === options.entrypoint);
  },
};

export const { version, build, prepareCache, startDevServer, shouldServe } =
  runtime;
