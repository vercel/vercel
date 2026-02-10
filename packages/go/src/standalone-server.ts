import { spawn } from 'child_process';
import { dirname, join, relative } from 'path';
import { readFile, writeFile, pathExists, copy } from 'fs-extra';
import {
  BuildOptions,
  Files,
  StartDevServerOptions,
  StartDevServerResult,
  glob,
  download,
  Lambda,
  FileBlob,
  getWriteableDirectory,
  debug,
  cloneEnv,
  getLambdaOptionsFromFunction,
} from '@vercel/build-utils';

import { createGo } from './go-helpers';

/**
 * Find the go.mod file starting from a directory and scanning up.
 */
export async function findGoModPath(entrypointDir: string, workPath: string) {
  let goModPath: string | undefined = undefined;
  let isGoModInRootDir = false;
  let dir = entrypointDir;

  while (!isGoModInRootDir) {
    isGoModInRootDir = dir === workPath;
    const goMod = join(dir, 'go.mod');
    if (await pathExists(goMod)) {
      goModPath = goMod;
      debug(`Found ${goModPath}"`);
      break;
    }
    dir = dirname(dir);
  }

  return {
    goModPath,
    isGoModInRootDir,
  };
}

/**
 * Build a standalone Go HTTP server (runtime framework preset mode).
 * This builds a bootstrap wrapper that handles the Vercel IPC protocol
 * and proxies requests to the user's Go server.
 */
export async function buildStandaloneServer({
  files,
  entrypoint,
  config,
  workPath,
  meta = {},
}: BuildOptions): Promise<{ output: Lambda }> {
  debug(`Building standalone Go server: ${entrypoint}`);

  await download(files, workPath, meta);

  // Get lambda options from config (memory, maxDuration, regions, architecture)
  const lambdaOptions = await getLambdaOptionsFromFunction({
    sourceFile: entrypoint,
    config,
  });

  const architecture = lambdaOptions?.architecture || 'x86_64';

  // Cross-compile for Linux with appropriate architecture
  const env = cloneEnv(process.env, meta.env, {
    GOARCH: architecture === 'arm64' ? 'arm64' : 'amd64',
    GOOS: 'linux',
    CGO_ENABLED: '0',
  });

  // Find go.mod starting from the entrypoint's directory, walking up to workPath.
  // This handles nested Go modules (e.g. services/go-api/go.mod) where the
  // module root is not the project root.
  const entrypointDir = join(workPath, dirname(entrypoint));
  const { goModPath } = await findGoModPath(entrypointDir, workPath);
  const modulePath = goModPath ? dirname(goModPath) : workPath;

  const go = await createGo({
    modulePath,
    opts: { cwd: modulePath, env },
    workPath,
  });

  const outDir = await getWriteableDirectory();
  const userServerPath = join(outDir, 'user-server');
  const bootstrapPath = join(outDir, 'executable');

  // Determine build target relative to the module root (where go.mod lives).
  // For nested modules the entrypoint path must be re-rooted:
  //   workPath=/project, entrypoint=services/go-api/main.go, modulePath=/project/services/go-api
  //   → relativeEntrypoint=main.go → buildTarget='.'
  // For root modules:
  //   workPath=/project, entrypoint=cmd/api/main.go, modulePath=/project
  //   → relativeEntrypoint=cmd/api/main.go → buildTarget='./cmd/api'
  const relativeEntrypoint = relative(modulePath, join(workPath, entrypoint));
  const buildTarget =
    relativeEntrypoint === 'main.go' ? '.' : './' + dirname(relativeEntrypoint);

  debug(
    `Building user Go server (${architecture}): go build ${buildTarget} -> ${userServerPath}`
  );

  try {
    await go.build(buildTarget, userServerPath);
  } catch (err) {
    console.error(`Failed to build standalone Go server: ${buildTarget}`);
    throw err;
  }

  // Build the bootstrap wrapper that handles IPC protocol (vc-init.go)
  const bootstrapSrc = join(__dirname, '../vc-init.go');
  debug(`Building bootstrap wrapper: ${bootstrapSrc} -> ${bootstrapPath}`);

  try {
    // Create a temporary directory for building the bootstrap
    const bootstrapBuildDir = await getWriteableDirectory();
    const bootstrapGoFile = join(bootstrapBuildDir, 'main.go');

    // Copy bootstrap source to temp directory
    await copy(bootstrapSrc, bootstrapGoFile);

    // Initialize a minimal go.mod for the bootstrap
    const bootstrapGoMod = join(bootstrapBuildDir, 'go.mod');
    await writeFile(bootstrapGoMod, 'module vc-init\n\ngo 1.21\n');

    // Build bootstrap with same env (cross-compile settings)
    const bootstrapGo = await createGo({
      modulePath: bootstrapBuildDir,
      opts: { cwd: bootstrapBuildDir, env },
      workPath: bootstrapBuildDir,
    });

    await bootstrapGo.build('.', bootstrapPath);
  } catch (err) {
    console.error('Failed to build bootstrap wrapper');
    throw err;
  }

  // Gather any additional files to include (user-specified via includeFiles)
  // Note: Static files in public/static/ should be handled by the static builder,
  // not bundled with the function. This follows the same pattern as Python.
  const includedFiles: Files = {};
  if (config && config.includeFiles) {
    const patterns = Array.isArray(config.includeFiles)
      ? config.includeFiles
      : [config.includeFiles];
    for (const pattern of patterns) {
      const fsFiles = await glob(pattern, workPath);
      for (const [assetName, asset] of Object.entries(fsFiles)) {
        includedFiles[assetName] = asset;
      }
    }
  }

  // Read both binaries as FileBlob (embedded data)
  // This ensures they persist regardless of temp file lifecycle
  const [userServerData, bootstrapData] = await Promise.all([
    readFile(userServerPath),
    readFile(bootstrapPath),
  ]);

  const lambda = new Lambda({
    ...lambdaOptions,
    files: {
      ...includedFiles,
      // Bootstrap is the main entrypoint (handles IPC protocol)
      executable: new FileBlob({ mode: 0o755, data: bootstrapData }),
      // User's server is spawned by bootstrap
      'user-server': new FileBlob({ mode: 0o755, data: userServerData }),
    },
    handler: 'executable',
    runtime: 'executable',
    supportsResponseStreaming: true,
    architecture,
    runtimeLanguage: 'go',
  });

  return { output: lambda };
}

/**
 * Start a dev server for standalone Go server mode.
 * This runs `go run <target>` directly with the PORT environment variable.
 */
export async function startStandaloneDevServer(
  opts: StartDevServerOptions,
  resolvedEntrypoint: string
): Promise<StartDevServerResult> {
  const { workPath, meta = {}, onStdout, onStderr } = opts;

  // Use a random port in the ephemeral range
  const port = Math.floor(Math.random() * (65535 - 49152) + 49152);

  const env = cloneEnv(process.env, meta.env, {
    PORT: String(port),
  });

  // Find go.mod starting from the entrypoint's directory, walking up to workPath.
  // This handles nested Go modules (e.g. services/go-api/go.mod).
  const entrypointDir = join(workPath, dirname(resolvedEntrypoint));
  const { goModPath } = await findGoModPath(entrypointDir, workPath);
  const modulePath = goModPath ? dirname(goModPath) : workPath;

  // Determine run target relative to the module root (where go.mod lives).
  const relativeEntrypoint = relative(
    modulePath,
    join(workPath, resolvedEntrypoint)
  );
  const runTarget =
    relativeEntrypoint === 'main.go' ? '.' : './' + dirname(relativeEntrypoint);

  debug(
    `Starting standalone Go dev server: go run ${runTarget} (port ${port}, cwd ${modulePath})`
  );

  const child = spawn('go', ['run', runTarget], {
    cwd: modulePath,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (child.stdout) {
    if (onStdout) {
      child.stdout.on('data', onStdout);
    } else {
      child.stdout.pipe(process.stdout);
    }
  }
  if (child.stderr) {
    if (onStderr) {
      child.stderr.on('data', onStderr);
    } else {
      child.stderr.pipe(process.stderr);
    }
  }

  // Give the server time to start
  await new Promise(resolve => setTimeout(resolve, 2000));

  return {
    port,
    pid: child.pid!,
  };
}
