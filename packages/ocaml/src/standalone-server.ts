/**
 * Standalone OCaml server support for Vercel runtime framework preset mode.
 *
 * This module handles building and running OCaml HTTP servers as standalone
 * executables. It uses a bootstrap wrapper (vc-init.ml) that implements
 * the Vercel IPC protocol.
 *
 * Architecture:
 * - User's server is built with dune as 'user-server' binary
 * - Bootstrap wrapper (vc_init.ml) is built as 'executable' (main entrypoint)
 * - Bootstrap handles IPC protocol and reverse proxies to user's server
 */

import { spawn } from 'child_process';
import { join } from 'path';
import { readFile, pathExists, copy, chmod } from 'fs-extra';
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

import {
  createOpam,
  findExecutablePath,
  buildBootstrap,
} from './ocaml-helpers';

/**
 * Build a standalone OCaml HTTP server (runtime framework preset mode).
 * This builds a bootstrap wrapper that handles the Vercel IPC protocol
 * and proxies requests to the user's OCaml server.
 */
export async function buildStandaloneServer({
  files,
  entrypoint,
  config,
  workPath,
  meta = {},
}: BuildOptions): Promise<{ output: Lambda }> {
  debug(`Building standalone OCaml server: ${entrypoint}`);

  await download(files, workPath, meta);

  // Get lambda options from config (memory, maxDuration, regions, architecture)
  const lambdaOptions = await getLambdaOptionsFromFunction({
    sourceFile: entrypoint,
    config,
  });

  const architecture = lambdaOptions?.architecture || 'x86_64';

  // Set up opam with cross-compile settings
  const opam = await createOpam({
    workPath,
    arch: architecture,
    env: cloneEnv(process.env, meta.env),
  });

  // Install dependencies
  await opam.install();

  // Build user's project with dune
  await opam.build();

  // Find the built executable
  const executablePath = join(workPath, await findExecutablePath(workPath));
  if (!(await pathExists(executablePath))) {
    throw new Error(
      `OCaml executable not found at ${executablePath}. ` +
        `Make sure your dune file defines an executable.`
    );
  }

  const outDir = await getWriteableDirectory();
  const userServerPath = join(outDir, 'user-server');
  const bootstrapPath = join(outDir, 'executable');

  // Copy user's built executable
  await copy(executablePath, userServerPath);
  await chmod(userServerPath, 0o755);
  debug(`Copied user server: ${executablePath} -> ${userServerPath}`);

  // Build the bootstrap wrapper that handles IPC protocol
  const bootstrapSrc = join(__dirname, '../vc-init.ml');
  await buildBootstrap(opam.env, bootstrapSrc, bootstrapPath);

  // Gather any additional files to include (user-specified via includeFiles)
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
  });

  return { output: lambda };
}

/**
 * Start a dev server for standalone OCaml server mode.
 * This runs `dune exec` directly with the PORT environment variable.
 */
export async function startStandaloneDevServer(
  opts: StartDevServerOptions,
  resolvedEntrypoint: string
): Promise<StartDevServerResult> {
  const { workPath, meta = {} } = opts;

  // Use a random port in the ephemeral range
  const port = Math.floor(Math.random() * (65535 - 49152) + 49152);

  const opam = await createOpam({
    workPath,
    env: cloneEnv(process.env, meta.env),
  });

  // Determine the executable name from the entrypoint
  // bin/main.ml -> ./bin/main.exe
  const exePath =
    './' + resolvedEntrypoint.replace('.ml', '.exe').replace(/^\//, '');

  debug(`Starting OCaml dev server: dune exec -- ${exePath} (port ${port})`);

  const child = spawn('dune', ['exec', '--', exePath], {
    cwd: workPath,
    env: { ...opam.env, PORT: String(port) },
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  // Give the server time to build and start
  await new Promise(resolve => setTimeout(resolve, 5000));

  return {
    port,
    pid: child.pid!,
  };
}
