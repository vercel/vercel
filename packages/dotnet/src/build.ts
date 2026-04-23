import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import {
  BuildOptions,
  BuildResultV3,
  download,
  glob,
  Files,
  Lambda,
  FileBlob,
  getWriteableDirectory,
  debug,
  getLambdaOptionsFromFunction,
} from '@vercel/build-utils';
import execa from 'execa';
import { buildBootstrap } from './bootstrap';
import { createDotnet } from './sdk';
import { findCsprojFile, getProjectName } from './project';

/**
 * Build a standalone .NET HTTP server with bootstrap wrapper.
 *
 * Produces two binaries in the Lambda:
 * - "executable": Rust bootstrap compiled from local source that handles
 *   IPC protocol, health checks, route prefix stripping, and reverse proxying
 * - "user-server": The self-contained .NET binary.
 *
 * The bootstrap starts the .NET binary on an internal port and proxies
 * requests to it.
 */
export async function buildDotnetServer({
  files,
  entrypoint,
  config,
  workPath,
  meta = {},
}: BuildOptions): Promise<BuildResultV3> {
  debug(`Building standalone .NET server: ${entrypoint}`);

  await download(files, workPath, meta);

  const lambdaOptions = await getLambdaOptionsFromFunction({
    sourceFile: entrypoint,
    config,
  });

  const architecture = lambdaOptions?.architecture || 'x86_64';

  let rid = 'linux-x64';
  if (architecture === 'arm64') {
    rid = 'linux-arm64';
  }

  // Find the .csproj to determine what to build
  const csprojPath = await findCsprojFile(workPath, entrypoint);
  const projectName = getProjectName(csprojPath);
  const csprojDir = dirname(join(workPath, csprojPath));
  const dotnet = await createDotnet({
    csprojPath: join(workPath, csprojPath),
    workPath,
    opts: {
      env: meta.env,
    },
  });

  debug(
    `Found project: ${csprojPath} (${projectName}) using SDK ${dotnet.sdkVersion}`
  );

  // Publish to a temp directory so we don't pollute the project
  const outDir = await getWriteableDirectory();

  // --- Build the .NET binary ---
  const publishArgs = [
    'publish',
    '-r',
    rid,
    '--self-contained',
    '-p:PublishSingleFile=true',
    '-p:InvariantGlobalization=true',
    '-c',
    'Release',
    '-o',
    outDir,
  ];

  debug(`Running: dotnet ${publishArgs.join(' ')}`);

  try {
    try {
      await execa(dotnet.dotnetPath, publishArgs, {
        cwd: csprojDir,
        env: dotnet.env,
      });
    } finally {
      await dotnet.cleanup();
    }
  } catch (err) {
    console.error(`Failed to build .NET project: ${csprojPath}`);
    throw err;
  }

  const userServerPath = join(outDir, projectName);

  debug(`Published .NET binary: ${userServerPath}`);

  // --- Build the bootstrap executable from local Rust source ---
  const bootstrapPath = await buildBootstrap({
    architecture,
    env: meta.env,
  });

  debug(`Using bootstrap: ${bootstrapPath}`);

  // --- Bundle into Lambda ---

  // Gather any additional files the user wants included
  const includedFiles: Files = {};
  if (config && config.includeFiles) {
    const patterns = Array.isArray(config.includeFiles)
      ? config.includeFiles
      : [config.includeFiles];

    for (let i = 0; i < patterns.length; i++) {
      const fsFiles = await glob(patterns[i], workPath);
      const names = Object.keys(fsFiles);
      for (let j = 0; j < names.length; j++) {
        includedFiles[names[j]] = fsFiles[names[j]];
      }
    }
  }

  // Read both binaries into memory as FileBlobs
  const [userServerData, bootstrapData] = await Promise.all([
    readFile(userServerPath),
    readFile(bootstrapPath),
  ]);

  debug(
    `Bootstrap: ${bootstrapData.length} bytes, ` +
      `User server: ${userServerData.length} bytes`
  );

  const lambda = new Lambda({
    ...lambdaOptions,
    files: {
      ...includedFiles,
      executable: new FileBlob({ mode: 0o755, data: bootstrapData }),
      'user-server': new FileBlob({ mode: 0o755, data: userServerData }),
    },
    handler: 'executable',
    runtime: 'executable',
    architecture,
    supportsResponseStreaming: true,
    // TODO: add runtimeLanguage: 'dotnet' once the API allowlist is updated
  });

  return { output: lambda };
}
