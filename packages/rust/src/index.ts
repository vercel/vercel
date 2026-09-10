import path from 'node:path';
import {
  FileFsRef,
  debug,
  download,
  glob,
  Lambda,
  type BuildOptions,
  type BuildResultVX,
  getLambdaOptionsFromFunction,
  getReportedServiceType,
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
  excludeCargoTargetDir,
  getExecutableName,
  gatherExtraFiles,
  missingEntrypointError,
  runUserScripts,
} from './lib/utils';
import {
  compileCargoBinary,
  createRustEnv,
  getRustHostTargetTriple,
  getTargetTriple,
  resolveCompiledBinaryPath,
} from './lib/compile';

import { startDevServer as rustStartDevServer } from './lib/start-dev-server';
import {
  buildStandaloneServer,
  getVercelRuntimeRoutes,
  isApiHandlerBuild,
  resolveStandaloneMode,
  startStandaloneDevServer,
  useStandaloneMode,
} from './standalone-server';
import { generateProjectManifest } from './diagnostics';
export { diagnostics } from './diagnostics';
export { detectEntrypoint, detectRustEntrypoint } from './entrypoint';

async function buildHandler(options: BuildOptions): Promise<BuildResultVX> {
  const BUILDER_DEBUG = Boolean(process.env.VERCEL_BUILDER_DEBUG ?? false);
  const isVercelBuild = Boolean(process.env.VERCEL_BUILD_IMAGE ?? false);

  const { files, entrypoint, workPath, config, meta, service } = options;

  // If we are not building on Vercel and we are not initiainted from `vercel dev`,
  // we are building for a prebuilt deployment, so we need to cross-compile
  const crossCompilationEnabled = !isVercelBuild && !meta?.isDev;

  if (crossCompilationEnabled && process.platform === 'win32') {
    throw new Error(
      'Production prebuilt deployments for @vercel/rust are not yet supported on Windows. Please use a Linux or macOS environment, or deploy directly on Vercel.'
    );
  }

  await installRustToolchain();

  debug('Creating file system');
  const downloadedFiles = await download(
    excludeCargoTargetDir(files, process.env, workPath),
    workPath,
    meta
  );

  const rustEnv = createRustEnv();

  const lambdaOptions = await getLambdaOptionsFromFunction({
    sourceFile: entrypoint,
    config,
  });
  const architecture = lambdaOptions?.architecture || 'x86_64';
  const targetTriple = getTargetTriple(architecture);
  const modeTarget = meta?.isDev
    ? await getRustHostTargetTriple(rustEnv)
    : targetTriple;

  if (await resolveStandaloneMode(workPath, entrypoint, rustEnv, modeTarget)) {
    return buildStandaloneServer(options, {
      rustEnv,
      crossCompilation: crossCompilationEnabled,
      verbose: BUILDER_DEBUG,
    });
  }

  const downloadedEntry = downloadedFiles[entrypoint];
  if (!downloadedEntry) {
    throw missingEntrypointError(entrypoint, isApiHandlerBuild(entrypoint));
  }
  const entryPath = downloadedEntry.fsPath;

  const cargoWorkspace = await findCargoWorkspace({
    env: rustEnv,
    cwd: path.dirname(entryPath),
  });

  const binaryName = findBinaryName(cargoWorkspace, entryPath);
  const cargoBuildConfiguration =
    await findCargoBuildConfiguration(cargoWorkspace);

  await runUserScripts(workPath);

  const extraFiles = await gatherExtraFiles(config.includeFiles, workPath);

  const buildVariant = meta?.isDev ? 'debug' : 'release';

  // When not building on Vercel (i.e. building for a prebuilt deployment),
  // cross-compile for Linux using `zigbuild`.
  await compileCargoBinary({
    workPath,
    rustEnv,
    binaryName,
    crossCompilation: crossCompilationEnabled,
    targetTriple,
    release: crossCompilationEnabled || !meta?.isDev,
    verbose: BUILDER_DEBUG,
  });

  debug(
    `Building \`${binaryName}\` for \`${process.platform}\` (\`${architecture}\`) completed`
  );

  const cargoMetadata = await getCargoMetadata(
    { cwd: workPath, env: rustEnv },
    targetTriple
  );

  const bin = resolveCompiledBinaryPath({
    targetDirectory: cargoMetadata.target_directory,
    crossCompilation: crossCompilationEnabled,
    targetTriple,
    buildTarget: cargoBuildConfiguration?.build.target,
    variant: buildVariant,
    binaryName,
  });

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

  let resolvedRustVersion: string | undefined;
  try {
    const { stdout: rustcOut } = await execa('rustc', ['--version'], {
      env: rustEnv,
      cwd: workPath,
    });
    // "rustc 1.87.0 (17067e9ac 2025-05-09)" → "1.87.0"
    resolvedRustVersion = rustcOut.split(' ')[1];
  } catch {
    debug('Failed to determine rustc version');
  }

  const rootPkg = cargoMetadata.packages.find(
    p => p.id === cargoMetadata.resolve.root
  );
  const requestedRustVersion = rootPkg?.rust_version || undefined;

  await generateProjectManifest({
    workPath,
    cargoMetadata,
    framework: config?.framework ?? undefined,
    serviceType: service ? getReportedServiceType(service) : undefined,
    runtimeVersion: resolvedRustVersion
      ? {
          ...(requestedRustVersion ? { requested: requestedRustVersion } : {}),
          resolved: resolvedRustVersion,
        }
      : undefined,
  });

  debug(`generating function for \`${entrypoint}\``);

  const routes = getVercelRuntimeRoutes(entrypoint, service);
  return {
    resultVersion: 3,
    result: { output: lambda, ...(routes ? { routes } : {}) },
  };
}

// Reference -  https://github.com/vercel/vercel/blob/main/DEVELOPING_A_RUNTIME.md#runtime-developer-reference
const runtime: Runtime = {
  // Standalone builds need a named V2 output and their own route table. The
  // classic `vercel_runtime` path stays V3 so preset routing remains intact.
  version: -1,
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
  startDevServer: async options => {
    const { workPath, entrypoint } = options;
    await installRustToolchain();
    const rustEnv = createRustEnv();
    const hostTarget = await getRustHostTargetTriple(rustEnv);
    if (
      await resolveStandaloneMode(workPath, entrypoint, rustEnv, hostTarget)
    ) {
      return startStandaloneDevServer(options);
    }
    return rustStartDevServer(options);
  },
  shouldServe: async (options): Promise<boolean> => {
    debug(`Requested ${options.requestPath} for ${options.entrypoint}`);
    // A standalone server owns its own routing, so it serves every request.
    //
    // Keyed on the resolved mode rather than just the entrypoint: a
    // `vercel_runtime` whole-app build is still reached through the preset's
    // catch-all route, so claiming every path here would shadow the static
    // assets that the `filesystem` phase is supposed to serve first.
    if (await useStandaloneMode(options.workPath, options.entrypoint)) {
      return true;
    }
    // Match exact path or path without .rs extension
    const entrypointWithoutExt = options.entrypoint.replace(/\.rs$/, '');
    const matches =
      options.requestPath === options.entrypoint ||
      options.requestPath === entrypointWithoutExt;
    debug(
      `shouldServe: ${matches} (entrypointWithoutExt: ${entrypointWithoutExt})`
    );
    return matches;
  },
};

export const { version, build, prepareCache, startDevServer, shouldServe } =
  runtime;
