import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import {
  FileFsRef,
  debug,
  download,
  glob,
  Lambda,
  type BuildOptions,
  type BuildResultV2Typical,
  getLambdaOptionsFromFunction,
  StartDevServer,
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
import { buildExecutableForDev } from './lib/dev-build';
import {
  waitForServerStart,
  waitForProcessExit,
  createDevServerEnv,
} from './lib/dev-server';

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

  const handler = getExecutableName('executable');
  const executableFile = new FileFsRef({ mode: 0o755, fsPath: bin });

  const lambda = new Lambda({
    files: {
      ...extraFiles,
      [handler]: executableFile,
    },
    handler,
    runtime: 'executable',
    supportsResponseStreaming: true,
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

  debug(`generating function for \`${entrypoint}\``);
  const route = parseRoute(entrypoint);

  return {
    output: {
      [entrypoint]: lambda,
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

export const startDevServer: StartDevServer = async opts => {
  const { entrypoint, workPath, meta = {} } = opts;

  debug(`Starting dev server for executable runtime: ${entrypoint}`);

  try {
    // Install Rust toolchain if needed
    await installRustToolchain();

    // Build the executable for development
    const executablePath = await buildExecutableForDev(workPath, entrypoint);

    debug(`Starting executable dev server: ${executablePath}`);

    // Create development environment
    const devEnv = createDevServerEnv(process.env, meta);

    // Start the executable as a dev server
    const child = spawn(executablePath, [], {
      cwd: workPath,
      env: devEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (!child.pid) {
      throw new Error('Failed to start dev server process');
    }

    debug(`Dev server process started with PID: ${child.pid}`);

    // Wait for the server to start and get the port
    const port = await waitForServerStart(child);

    debug(`Dev server listening on port ${port}`);

    // Return dev server info
    return {
      port,
      pid: child.pid,
      shutdown: async () => {
        debug(`Shutting down dev server (PID: ${child.pid})`);

        // Send SIGTERM for graceful shutdown
        child.kill('SIGTERM');

        // Wait for process to exit
        await waitForProcessExit(child);

        debug('Dev server shutdown complete');
      },
    };
  } catch (error) {
    debug(`Failed to start dev server: ${error}`);

    // Return null to indicate dev server couldn't be started
    // This will cause vercel dev to fall back to build-and-invoke mode
    return null;
  }
};

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
  startDevServer,
  shouldServe: async (options): Promise<boolean> => {
    debug(`Requested ${options.requestPath} for ${options.entrypoint}`);

    if (isBundledRoute()) {
      return Promise.resolve(options.entrypoint === 'api/main');
    }

    return Promise.resolve(options.requestPath === options.entrypoint);
  },
};

export const { version, build, prepareCache, shouldServe } = runtime;
