import { join, dirname, relative } from 'path';
import { readFileSync, lstatSync } from 'fs';
import buildUtils from './build-utils';
import { BuildOptions, Lambda, File } from '@vercel/build-utils';
const {
  download,
  glob,
  createLambda,
  shouldServe,
  debug,
  getNodeVersion,
  getSpawnOptions,
  runNpmInstall,
  spawnAsync,
  isSymbolicLink,
  FileFsRef,
  FileBlob,
} = buildUtils;
import nodeFileTrace from '@zeit/node-file-trace';

export const version = 2;

export async function build({
  workPath,
  files,
  entrypoint,
  meta = {},
  config = {},
}: BuildOptions) {
  await download(files, workPath, meta);

  const entrypointFsDirname = join(workPath, dirname(entrypoint));
  const nodeVersion = await getNodeVersion(
    entrypointFsDirname,
    undefined,
    config,
    meta
  );

  const spawnOpts = getSpawnOptions(meta, nodeVersion);
  await runNpmInstall(
    entrypointFsDirname,
    ['--prefer-offline'],
    spawnOpts,
    meta
  );

  debug('Running build script...');
  await spawnAsync('yarn', ['rw', 'build'], {
    ...spawnOpts,
    cwd: workPath,
    prettyCommand: 'yarn rw build',
  });

  const lambdaOutputs: { [filePath: string]: Lambda } = {};

  const staticOutputs = await glob('**', {
    cwd: join(workPath, 'web', 'dist'),
  });

  const inputFsFiles = await glob('*.js', {
    cwd: join(workPath, 'api', 'dist', 'functions'),
  });

  const sourceCache = new Map<string, Buffer | null>();
  const fsCache = new Map<string, File>();
  const inputs = Object.keys(inputFsFiles);
  const { fileList, warnings } = await nodeFileTrace(inputs, {
    base: workPath,
    readFile(fsPath: string): string | null {
      const relPath = relative(workPath, fsPath);
      const cached = sourceCache.get(relPath);
      if (cached) return cached.toString();
      // null represents a not found
      if (cached === null) return null;
      try {
        const source = readFileSync(fsPath);
        const { mode } = lstatSync(fsPath);
        const file = isSymbolicLink(mode)
          ? new FileFsRef({ fsPath, mode })
          : new FileBlob({ data: source, mode });
        fsCache.set(relPath, file);
        sourceCache.set(relPath, source);
        return source.toString();
      } catch (e) {
        if (e.code === 'ENOENT' || e.code === 'EISDIR') {
          sourceCache.set(relPath, null);
          return null;
        }
        throw e;
      }
    },
  });

  console.log({ warnings });

  const tracedFiles: { [filename: string]: File } = {};
  for (const filePath of fileList) {
    const file = fsCache.get(filePath);
    if (file) {
      tracedFiles[filePath] = file;
    }
  }

  for (const [filePath] of Object.entries(inputs)) {
    const filename = filePath.slice(0, -3); // strip .js
    const lambda = await createLambda({
      files: tracedFiles,
      handler: `${filename}.handler`,
      runtime: nodeVersion.runtime,
      environment: {},
    });
    lambdaOutputs[filename] = lambda;
  }

  return {
    output: { ...staticOutputs, ...lambdaOutputs },
    routes: [{ handle: 'filesystem' }, { src: '/.*', dest: '/index.html' }],
    watch: [],
  };
}

export { shouldServe };
