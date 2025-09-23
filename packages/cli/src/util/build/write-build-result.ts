import fs from 'fs-extra';
import mimeTypes from 'mime-types';
import {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
  posix,
} from 'path';
import {
  type Builder,
  type BuildResultV2,
  type BuildResultV3,
  type File,
  type Files,
  FileFsRef,
  type BuilderV2,
  type BuilderV3,
  type Lambda,
  type PackageJson,
  type Prerender,
  download,
  downloadFile,
  type EdgeFunction,
  type BuildResultBuildOutput,
  getLambdaOptionsFromFunction,
  normalizePath,
  type TriggerEvent,
} from '@vercel/build-utils';
import pipe from 'promisepipe';
import { merge } from './merge';
import { unzip } from './unzip';
import { VERCEL_DIR } from '../projects/link';
import { fileNameSymbol, type VercelConfig } from '@vercel/client';

const { normalize } = posix;
export const OUTPUT_DIR = join(VERCEL_DIR, 'output');

/**
 * An entry in the "functions" object in `vercel.json`.
 */
interface FunctionConfiguration {
  architecture?: string;
  memory?: number;
  maxDuration?: number;
  experimentalTriggers?: TriggerEvent[];
  supportsCancellation?: boolean;
}

export async function writeBuildResult(
  repoRootPath: string,
  outputDir: string,
  buildResult: BuildResultV2 | BuildResultV3,
  build: Builder,
  builder: BuilderV2 | BuilderV3,
  builderPkg: PackageJson,
  vercelConfig: VercelConfig | null,
  standalone: boolean = false
) {
  let version = builder.version;
  if (
    'experimentalVersion' in builder &&
    process.env.VERCEL_EXPERIMENTAL_EXPRESS_BUILD === '1' &&
    'name' in builder &&
    builder.name === 'express'
  ) {
    version = builder.experimentalVersion as 2 | 3;
  }
  if (typeof version !== 'number' || version === 2) {
    return writeBuildResultV2(
      repoRootPath,
      outputDir,
      buildResult as BuildResultV2,
      build,
      vercelConfig,
      standalone
    );
  } else if (version === 3) {
    return writeBuildResultV3(
      repoRootPath,
      outputDir,
      buildResult as BuildResultV3,
      build,
      vercelConfig,
      standalone
    );
  }
  throw new Error(
    `Unsupported Builder version \`${version}\` from "${builderPkg.name}"`
  );
}

function isEdgeFunction(v: any): v is EdgeFunction {
  return v?.type === 'EdgeFunction';
}

function isLambda(v: any): v is Lambda {
  return v?.type === 'Lambda';
}

function isPrerender(v: any): v is Prerender {
  return v?.type === 'Prerender';
}

function isFile(v: any): v is File {
  const type = v?.type;
  return type === 'FileRef' || type === 'FileFsRef' || type === 'FileBlob';
}

export interface PathOverride {
  contentType?: string;
  path?: string;
}

/**
 * Remove duplicate slashes as well as leading/trailing slashes.
 */
function stripDuplicateSlashes(path: string): string {
  return normalize(path).replace(/(^\/|\/$)/g, '');
}

/**
 * Writes the output from the `build()` return value of a v2 Builder to
 * the filesystem.
 */
async function writeBuildResultV2(
  repoRootPath: string,
  outputDir: string,
  buildResult: BuildResultV2,
  build: Builder,
  vercelConfig: VercelConfig | null,
  standalone: boolean = false
) {
  if ('buildOutputPath' in buildResult) {
    await mergeBuilderOutput(outputDir, buildResult);
    return;
  }

  // Some very old `@now` scoped Builders return `output` at the top-level.
  // These Builders are no longer supported.
  if (!buildResult.output) {
    const configFile = vercelConfig?.[fileNameSymbol];
    const updateMessage = build.use.startsWith('@now/')
      ? ` Please update from "@now" to "@vercel" in your \`${configFile}\` file.`
      : '';
    throw new Error(
      `The build result from "${build.use}" is missing the "output" property.${updateMessage}`
    );
  }

  const existingFunctions = new Map<Lambda | EdgeFunction, string>();
  const overrides: Record<string, PathOverride> = {};

  for (const [path, output] of Object.entries(buildResult.output)) {
    const normalizedPath = stripDuplicateSlashes(path);
    if (isLambda(output)) {
      await writeLambda(
        repoRootPath,
        outputDir,
        output,
        normalizedPath,
        undefined,
        existingFunctions,
        standalone
      );
    } else if (isPrerender(output)) {
      if (!output.lambda) {
        throw new Error(
          `Invalid Prerender with no "lambda" property: ${normalizedPath}`
        );
      }

      await writeLambda(
        repoRootPath,
        outputDir,
        output.lambda,
        normalizedPath,
        undefined,
        existingFunctions,
        standalone
      );

      // Write the fallback file alongside the Lambda directory
      let fallback = output.fallback;
      if (fallback) {
        const ext = getFileExtension(fallback);
        const fallbackName = `${normalizedPath}.prerender-fallback${ext}`;
        const fallbackPath = join(outputDir, 'functions', fallbackName);

        // if file is already on the disk we can hard link
        // instead of creating a new copy
        let usedHardLink = false;
        if ('fsPath' in fallback) {
          try {
            await fs.link(fallback.fsPath, fallbackPath);
            usedHardLink = true;
          } catch (_) {
            // if link fails we continue attempting to copy
          }
        }

        if (!usedHardLink) {
          const stream = fallback.toStream();
          await pipe(
            stream,
            fs.createWriteStream(fallbackPath, { mode: fallback.mode })
          );
        }
        fallback = new FileFsRef({
          ...output.fallback,
          fsPath: basename(fallbackName),
        });
      }

      const prerenderConfigPath = join(
        outputDir,
        'functions',
        `${normalizedPath}.prerender-config.json`
      );
      const prerenderConfig = {
        ...output,
        lambda: undefined,
        fallback,
      };
      await fs.writeJSON(prerenderConfigPath, prerenderConfig, { spaces: 2 });
    } else if (isFile(output)) {
      await writeStaticFile(
        outputDir,
        output,
        normalizedPath,
        overrides,
        vercelConfig?.cleanUrls
      );
    } else if (isEdgeFunction(output)) {
      await writeEdgeFunction(
        repoRootPath,
        outputDir,
        output,
        normalizedPath,
        existingFunctions,
        standalone
      );
    } else {
      throw new Error(
        `Unsupported output type: "${
          (output as any).type
        }" for ${normalizedPath}`
      );
    }
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

/**
 * Writes the output from the `build()` return value of a v3 Builder to
 * the filesystem.
 */
async function writeBuildResultV3(
  repoRootPath: string,
  outputDir: string,
  buildResult: BuildResultV3,
  build: Builder,
  vercelConfig: VercelConfig | null,
  standalone: boolean = false
) {
  const { output } = buildResult;
  const src = build.src;
  if (typeof src !== 'string') {
    throw new Error(`Expected "build.src" to be a string`);
  }

  const functionConfiguration = vercelConfig
    ? await getLambdaOptionsFromFunction({
        sourceFile: src,
        config: vercelConfig,
      })
    : {};

  const ext = extname(src);
  const path = stripDuplicateSlashes(
    build.config?.zeroConfig ? src.substring(0, src.length - ext.length) : src
  );
  if (isLambda(output)) {
    await writeLambda(
      repoRootPath,
      outputDir,
      output,
      path,
      functionConfiguration,
      undefined,
      standalone
    );
  } else if (isEdgeFunction(output)) {
    await writeEdgeFunction(
      repoRootPath,
      outputDir,
      output,
      path,
      undefined,
      standalone
    );
  } else {
    throw new Error(
      `Unsupported output type: "${(output as any).type}" for ${build.src}`
    );
  }
}

/**
 * Writes a static `File` instance to the file system in the "static" directory.
 * If the filename does not have a file extension then one attempts to be inferred
 * from the extension of the `fsPath`.
 *
 * @param file The `File` instance to write
 * @param path The URL path where the `File` can be accessed from
 * @param overrides Record of override configuration when a File is renamed or has other metadata
 */
async function writeStaticFile(
  outputDir: string,
  file: File,
  path: string,
  overrides: Record<string, PathOverride>,
  cleanUrls = false
) {
  let fsPath = path;
  let override: PathOverride | null = null;

  // If the output path doesn't match the determined file extension of
  // the File then add the extension. This is to help avoid conflicts
  // where an output path matches a directory name of another output path
  // (i.e. `blog` -> `blog.html` and `blog/hello` -> `blog/hello.html`)
  const ext = getFileExtension(file);
  if (ext && extname(path) !== ext) {
    fsPath += ext;
    if (!override) override = {};
    override.path = path;
  }

  // If `cleanUrls` is true then remove the `.html` file extension
  // for HTML files.
  if (cleanUrls && path.endsWith('.html')) {
    if (!override) override = {};
    override.path = path.slice(0, -5);
  }

  // Ensure an explicit "content-type" on the `File` is returned in
  // the final output asset.
  if (file.contentType) {
    if (!override) override = {};
    override.contentType = file.contentType;
  }

  if (override) {
    overrides[fsPath] = override;
  }

  const dest = join(outputDir, 'static', fsPath);
  await fs.mkdirp(dirname(dest));

  // if already on disk hard link instead of copying
  if ('fsPath' in file) {
    try {
      return await fs.link(file.fsPath, dest);
    } catch (_) {
      // if link fails we continue attempting to copy
    }
  }
  await downloadFile(file, dest);
}

/**
 * If the `fn` Lambda or Edge function has already been written to
 * the filesystem at a different location, then create a symlink
 * to the previous location instead of copying the files again.
 *
 * @param outputPath The path of the `.vercel/output` directory
 * @param dest The path of destination function's `.func` directory
 * @param fn The Lambda or EdgeFunction instance to create the symlink for
 * @param existingFunctions Map of `Lambda`/`EdgeFunction` instances that have previously been written
 */
async function writeFunctionSymlink(
  outputDir: string,
  dest: string,
  fn: Lambda | EdgeFunction,
  existingFunctions: Map<Lambda | EdgeFunction, string>
) {
  const existingPath = existingFunctions.get(fn);

  // Function has not been written to the filesystem, so bail
  if (!existingPath) return false;

  const destDir = dirname(dest);
  const targetDest = join(outputDir, 'functions', `${existingPath}.func`);
  const target = relative(destDir, targetDest);
  await fs.mkdirp(destDir);
  await fs.symlink(target, dest);
  return true;
}

/**
 * Serializes the `EdgeFunction` instance to the file system.
 *
 * @param outputPath The path of the `.vercel/output` directory
 * @param edgeFunction The `EdgeFunction` instance
 * @param path The URL path where the `EdgeFunction` can be accessed from
 * @param existingFunctions (optional) Map of `Lambda`/`EdgeFunction` instances that have previously been written
 */
async function writeEdgeFunction(
  repoRootPath: string,
  outputDir: string,
  edgeFunction: EdgeFunction,
  path: string,
  existingFunctions?: Map<Lambda | EdgeFunction, string>,
  standalone: boolean = false
) {
  const dest = join(outputDir, 'functions', `${path}.func`);

  if (existingFunctions) {
    if (
      await writeFunctionSymlink(
        outputDir,
        dest,
        edgeFunction,
        existingFunctions
      )
    ) {
      return;
    }
    existingFunctions.set(edgeFunction, path);
  }

  await fs.mkdirp(dest);
  const ops: Promise<any>[] = [];
  const sharedDest = join(outputDir, 'shared');
  const { files, filePathMap, shared } = filesWithoutFsRefs(
    edgeFunction.files,
    repoRootPath,
    sharedDest,
    standalone
  );
  ops.push(download(files, dest));
  if (shared) {
    ops.push(download(shared, sharedDest));
  }

  const config = {
    runtime: 'edge',
    ...edgeFunction,
    entrypoint: normalizePath(edgeFunction.entrypoint),
    filePathMap,
    files: undefined,
    type: undefined,
  };
  const configPath = join(dest, '.vc-config.json');
  ops.push(
    fs.writeJSON(configPath, config, {
      spaces: 2,
    })
  );
  await Promise.all(ops);
}

/**
 * Writes the file references from the `Lambda` instance to the file system.
 *
 * @param outputPath The path of the `.vercel/output` directory
 * @param lambda The `Lambda` instance
 * @param path The URL path where the `Lambda` can be accessed from
 * @param functionConfiguration (optional) Extra configuration to apply to the function's `.vc-config.json` file
 * @param existingFunctions (optional) Map of `Lambda`/`EdgeFunction` instances that have previously been written
 */
async function writeLambda(
  repoRootPath: string,
  outputDir: string,
  lambda: Lambda,
  path: string,
  functionConfiguration?: FunctionConfiguration,
  existingFunctions?: Map<Lambda | EdgeFunction, string>,
  standalone: boolean = false
) {
  const dest = join(outputDir, 'functions', `${path}.func`);

  if (existingFunctions) {
    if (
      await writeFunctionSymlink(outputDir, dest, lambda, existingFunctions)
    ) {
      return;
    }
    existingFunctions.set(lambda, path);
  }

  await fs.mkdirp(dest);
  const ops: Promise<any>[] = [];
  let filePathMap: Record<string, string> | undefined;
  if (lambda.files) {
    const sharedDest = join(outputDir, 'shared');
    // `files` is defined
    const f = filesWithoutFsRefs(
      lambda.files,
      repoRootPath,
      sharedDest,
      standalone
    );
    filePathMap = f.filePathMap;
    ops.push(download(f.files, dest));
    if (f.shared) {
      ops.push(download(f.shared, sharedDest));
    }
  } else if (lambda.zipBuffer) {
    // Builders that use the deprecated `createLambda()` might only have `zipBuffer`
    ops.push(unzip(lambda.zipBuffer, dest));
  } else {
    throw new Error('Malformed `Lambda` - no "files" present');
  }

  const architecture =
    functionConfiguration?.architecture ?? lambda.architecture;
  const memory = functionConfiguration?.memory ?? lambda.memory;
  const maxDuration = functionConfiguration?.maxDuration ?? lambda.maxDuration;
  const experimentalTriggers =
    functionConfiguration?.experimentalTriggers ?? lambda.experimentalTriggers;
  const supportsCancellation =
    functionConfiguration?.supportsCancellation ?? lambda.supportsCancellation;

  const config = {
    ...lambda,
    handler: normalizePath(lambda.handler),
    architecture,
    memory,
    maxDuration,
    experimentalTriggers,
    supportsCancellation,
    filePathMap,
    type: undefined,
    files: undefined,
    zipBuffer: undefined,
  };
  const configPath = join(dest, '.vc-config.json');
  ops.push(
    fs.writeJSON(configPath, config, {
      spaces: 2,
    })
  );
  await Promise.all(ops);

  // XXX: remove any `.vercel/builders` directories that were
  // extracted into the `dest` dir. This is a temporary band-aid
  // to make `vercel-php` work since it is inadvertently including
  // `.vercel/builders` into the Lambda files due to glob syntax.
  // See: https://github.com/juicyfx/vercel-php/pull/232
  for await (const dir of findDirs('.vercel', dest)) {
    const absDir = join(dest, dir);
    const entries = await fs.readdir(absDir);
    if (entries.includes('cache')) {
      // Delete everything except for "cache"
      await Promise.all(
        entries
          .filter(e => e !== 'cache')
          .map(entry => fs.remove(join(absDir, entry)))
      );
    } else {
      // Delete the entire `.vercel` directory
      await fs.remove(absDir);
    }
  }
}

/**
 * When the Root Directory setting is utilized, merge the contents of the
 * `.vercel/output` directory that was specified by the Builder into the
 * `vc build` output directory.
 */
async function mergeBuilderOutput(
  outputDir: string,
  buildResult: BuildResultBuildOutput
) {
  const absOutputDir = resolve(outputDir);
  if (absOutputDir === buildResult.buildOutputPath) {
    // `.vercel/output` dir is already in the correct location,
    // so no need to do anything
    return;
  }
  await merge(buildResult.buildOutputPath, outputDir);
}

/**
 * Attempts to return the file extension (i.e. `.html`) from the given
 * `File` instance, based on its actual filesystem path and/or the
 * "content-type" of the File.
 */
function getFileExtension(file: File): string {
  let ext = '';
  if (file.type === 'FileFsRef') {
    ext = extname(file.fsPath);
  }
  if (!ext && file.contentType) {
    const e = mimeTypes.extension(file.contentType);
    if (e) {
      ext = `.${e}`;
    }
  }
  return ext;
}

/**
 * Creates an async iterator that scans a directory
 * for sub-directories with the matching `name`.
 */
export async function* findDirs(
  name: string,
  dir: string,
  root = dir
): AsyncIterable<string> {
  let paths: string[];
  try {
    paths = await fs.readdir(dir);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
    paths = [];
  }
  for (const path of paths) {
    const abs = join(dir, path);
    let stat: fs.Stats;
    try {
      stat = await fs.lstat(abs);
    } catch (err: any) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }
    if (stat.isDirectory()) {
      if (path === name) {
        yield relative(root, abs);
      } else {
        yield* findDirs(name, abs, root);
      }
    }
  }
}

/**
 * Removes the `FileFsRef` instances from the `Files` object
 * and returns them in a JSON serializable map of repo root
 * relative paths to Lambda destination paths.
 */
export function filesWithoutFsRefs(
  files: Files,
  repoRootPath: string,
  sharedDest?: string,
  standalone?: boolean
): { files: Files; filePathMap?: Record<string, string>; shared?: Files } {
  let filePathMap: Record<string, string> | undefined;
  const out: Files = {};
  const shared: Files = {};
  for (const [path, file] of Object.entries(files)) {
    if (file.type === 'FileFsRef') {
      if (!filePathMap) filePathMap = {};
      if (standalone && sharedDest) {
        shared[path] = file;
        filePathMap[normalizePath(path)] = normalizePath(
          relative(repoRootPath, join(sharedDest, path))
        );
      } else {
        filePathMap[normalizePath(path)] = normalizePath(
          relative(repoRootPath, file.fsPath)
        );
      }
    } else {
      out[path] = file;
    }
  }
  return { files: out, filePathMap, shared };
}
