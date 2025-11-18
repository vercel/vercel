import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import {
  FileFsRef,
  debug,
  download,
  glob,
  Lambda,
  type BuildOptions,
  type BuildResultV2Typical,
  getLambdaOptionsFromFunction,
  getProvidedRuntime,
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
import { generateRoutes, parseRoute } from './lib/routes';

type RustEnv = Record<'RUSTFLAGS' | 'PATH', string>;

async function buildHandler(
  options: BuildOptions
): Promise<BuildResultV2Typical> {
  const BUILDER_DEBUG = Boolean(process.env.VERCEL_BUILDER_DEBUG ?? false);
  const { files, entrypoint, workPath, config, meta } = options;

  await installRustToolchain();

  debug('Creating file system');
  const downloadedFiles = await download(files, workPath, meta);
  const entryPath = downloadedFiles[entrypoint].fsPath;

  const HOME =
    process.platform === 'win32' ? assertEnv('USERPROFILE') : assertEnv('HOME');
  const PATH = assertEnv('PATH');

  const rustEnv: RustEnv = {
    PATH: `${path.join(HOME, '.cargo/bin')}:${PATH}`,
    RUSTFLAGS: [process.env.RUSTFLAGS].filter(Boolean).join(' '),
  };

  const cargoWorkspace = await findCargoWorkspace({
    env: rustEnv,
    cwd: path.dirname(entryPath),
  });

  const binaryName = findBinaryName(cargoWorkspace, entryPath);
  const cargoBuildConfiguration =
    await findCargoBuildConfiguration(cargoWorkspace);
  const buildTarget = cargoBuildConfiguration?.build.target ?? '';

  await runUserScripts(workPath);

  const extraFiles = await gatherExtraFiles(config.includeFiles, workPath);

  debug(`Running \`cargo build\` for \`${binaryName}\``);
  try {
    await execa(
      'cargo',
      ['build', '--bin', binaryName].concat(
        BUILDER_DEBUG ? ['--verbose'] : ['--quiet'],
        meta?.isDev ? [] : ['--release']
      ),
      {
        cwd: workPath,
        env: rustEnv,
        stdio: 'inherit',
      }
    );
  } catch (err) {
    debug(`Running \`cargo build\` for \`${binaryName}\` failed`);
    throw err;
  }

  debug(`Building \`${binaryName}\` for \`${process.platform}\` completed`);

  let { target_directory: targetDirectory } = await getCargoMetadata({
    cwd: workPath,
    env: rustEnv,
  });

  targetDirectory = path.join(targetDirectory, buildTarget);

  const buildVariant = BUILDER_DEBUG || meta?.isDev ? 'debug' : 'release';

  const bin = path.join(
    targetDirectory,
    buildVariant,
    getExecutableName(binaryName)
  );

  const lambdaOptions = await getLambdaOptionsFromFunction({
    sourceFile: entrypoint,
    config,
  });

  const bootstrap = getExecutableName('bootstrap');
  const runtime = meta?.isDev ? 'provided' : await getProvidedRuntime();
  const lambda = new Lambda({
    files: {
      ...extraFiles,
      [bootstrap]: new FileFsRef({ mode: 0o755, fsPath: bin }),
    },
    handler: bootstrap,
    runtime,
    ...lambdaOptions,
  });
  lambda.zipBuffer = await lambda.createZip();

  if (isBundledRoute()) {
    debug(
      `experimental \`route-bundling\` detected - generating single entrypoint`
    );
    const handlerFiles = await glob('api/**/*.rs', workPath);
    const handlerKeysWithoutMain = Object.keys(handlerFiles).filter(
      filename => !filename.endsWith('/main.rs')
    );
    const routes = generateRoutes(handlerKeysWithoutMain);

    return {
      output: routes.reduce<Record<string, Lambda>>((acc, route) => {
        acc[route.path] = lambda;
        return acc;
      }, {}),
      routes: routes.map(({ src, dest }) => ({ src, dest })),
    };
  }

  debug(`generating lambda for \`${entrypoint}\``);
  const route = parseRoute(entrypoint);
  return {
    output: {
      [route.path]: lambda,
    },
    routes: [{ src: route.src, dest: route.dest }],
  };
}

function isBundledRoute(): boolean {
  if (existsSync('api/main.rs')) {
    const content = readFileSync('api/main.rs', 'utf8');
    return content.includes('bundled_api]') || content.includes('bundled_api(');
  }

  return false;
}

// Reference -  https://github.com/vercel/vercel/blob/main/DEVELOPING_A_RUNTIME.md#runtime-developer-reference
const runtime: Runtime = {
  version: 2,
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
  shouldServe: async (options): Promise<boolean> => {
    debug(`Requested ${options.requestPath} for ${options.entrypoint}`);

    if (isBundledRoute()) {
      return Promise.resolve(options.entrypoint === 'api/main');
    }

    return Promise.resolve(options.requestPath === options.entrypoint);
  },
};

export const { version, build, prepareCache, shouldServe } = runtime;
