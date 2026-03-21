import { join, dirname } from 'path';
import { readFile } from 'fs-extra';
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

/**
 * Find the .csproj file in the project directory.
 * Searches the entrypoint's directory first, then the workPath root.
 */
async function findCsprojFile(
  workPath: string,
  entrypoint: string
): Promise<string> {
  const entrypointDir = dirname(join(workPath, entrypoint));

  let csprojFiles = await glob('*.csproj', entrypointDir);
  let keys = Object.keys(csprojFiles);

  if (keys.length === 0 && entrypointDir !== workPath) {
    csprojFiles = await glob('*.csproj', workPath);
    keys = Object.keys(csprojFiles);
  }

  if (keys.length === 0) {
    throw new Error(`No .csproj file found in ${entrypointDir} or ${workPath}`);
  }

  if (keys.length > 1) {
    throw new Error(
      `Multiple .csproj files found: ${keys.join(', ')}. ` +
        'Use a .sln file or set the entrypoint to the correct project directory.'
    );
  }

  return keys[0];
}

/**
 * Extract the project name from a .csproj filename.
 * "HelloWorld.csproj" -> "HelloWorld"
 */
function getProjectName(csprojPath: string): string {
  const filename = csprojPath.split('/').pop() || csprojPath;
  return filename.replace(/\.csproj$/, '');
}

/**
 * Build a standalone .NET HTTP server with bootstrap wrapper.
 *
 * Produces two binaries in the Lambda:
 * - "executable": Pre-compiled Go bootstrap that handles IPC protocol,
 *   health checks, route prefix stripping, and reverse proxying.
 *   (Forked from packages/go/vc-init.go, adds ASPNETCORE_URLS for .NET)
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
  let bootstrapName = 'bootstrap-linux-x64';
  if (architecture === 'arm64') {
    rid = 'linux-arm64';
    bootstrapName = 'bootstrap-linux-arm64';
  }

  // Find the .csproj to determine what to build
  const csprojPath = await findCsprojFile(workPath, entrypoint);
  const projectName = getProjectName(csprojPath);
  const csprojDir = dirname(join(workPath, csprojPath));

  debug(`Found project: ${csprojPath} (${projectName})`);

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
    await execa('dotnet', publishArgs, {
      cwd: csprojDir,
    });
  } catch (err) {
    console.error(`Failed to build .NET project: ${csprojPath}`);
    throw err;
  }

  const userServerPath = join(outDir, projectName);

  debug(`Published .NET binary: ${userServerPath}`);

  // --- Load the pre-compiled bootstrap ---
  const bootstrapPath = join(__dirname, '..', bootstrapName);

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
