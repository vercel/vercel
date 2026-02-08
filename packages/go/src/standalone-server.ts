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
async function findGoModPath(entrypointDir: string, workPath: string) {
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

  // Search for go.mod starting from the entrypoint's directory (not the
  // project root) so that service workspaces with their own go.mod are found.
  const entrypointDir = join(workPath, dirname(entrypoint));
  const { goModPath } = await findGoModPath(entrypointDir, workPath);
  const modulePath = goModPath ? dirname(goModPath) : entrypointDir;

  const go = await createGo({
    modulePath,
    opts: { cwd: modulePath, env },
    workPath,
  });

  const outDir = await getWriteableDirectory();
  const userServerPath = join(outDir, 'user-server');
  const bootstrapPath = join(outDir, 'executable');

  // Determine build target relative to the module directory (where go.mod lives).
  // e.g. if go.mod is in services/go-api/ and entrypoint is services/go-api/main.go → '.'
  //      if go.mod is at root and entrypoint is cmd/api/main.go → './cmd/api'
  const relToModule = relative(modulePath, join(workPath, dirname(entrypoint)));
  const buildTarget = relToModule ? './' + relToModule : '.';

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

  // Find go.mod starting from the entrypoint's directory so that service
  // workspaces with their own go.mod are resolved correctly.
  const entrypointDir = join(workPath, dirname(resolvedEntrypoint));
  const { goModPath } = await findGoModPath(entrypointDir, workPath);
  const goCwd = goModPath ? dirname(goModPath) : entrypointDir;

  // Determine run target relative to the module directory (where go.mod lives).
  const relToModule = relative(
    goCwd,
    join(workPath, dirname(resolvedEntrypoint))
  );
  const runTarget = relToModule ? './' + relToModule : '.';

  debug(
    `Starting standalone Go dev server: go run ${runTarget} (cwd=${goCwd}, port ${port})`
  );

  const child = spawn('go', ['run', runTarget], {
    cwd: goCwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Route stdout/stderr through the provided callbacks (service logger)
  // so output gets the proper [service-name] prefix
  if (child.stdout) {
    child.stdout.on('data', data => {
      if (onStdout) {
        onStdout(data);
      } else {
        process.stdout.write(data);
      }
    });
  }
  if (child.stderr) {
    child.stderr.on('data', data => {
      if (onStderr) {
        onStderr(data);
      } else {
        process.stderr.write(data);
      }
    });
  }

  // Give the server time to start
  await new Promise(resolve => setTimeout(resolve, 2000));

  return {
    port,
    pid: child.pid!,
  };
}
