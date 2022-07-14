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
  Builder,
  BuildResultV2,
  BuildResultV3,
  File,
  FileFsRef,
  BuilderV2,
  BuilderV3,
  Lambda,
  PackageJson,
  Prerender,
  download,
  EdgeFunction,
  BuildResultBuildOutput,
} from '@vercel/build-utils';
import pipe from 'promisepipe';
import { unzip } from './unzip';
import { VERCEL_DIR } from '../projects/link';

const { normalize } = posix;
export const OUTPUT_DIR = join(VERCEL_DIR, 'output');

export async function writeBuildResult(
  outputDir: string,
  buildResult: BuildResultV2 | BuildResultV3,
  build: Builder,
  builder: BuilderV2 | BuilderV3,
  builderPkg: PackageJson,
  cleanUrls?: boolean
) {
  const { version } = builder;
  if (typeof version !== 'number' || version === 2) {
    return writeBuildResultV2(
      outputDir,
      buildResult as BuildResultV2,
      cleanUrls
    );
  } else if (version === 3) {
    return writeBuildResultV3(outputDir, buildResult as BuildResultV3, build);
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
  outputDir: string,
  buildResult: BuildResultV2,
  cleanUrls?: boolean
) {
  if ('buildOutputPath' in buildResult) {
    await mergeBuilderOutput(outputDir, buildResult);
    return;
  }

  const lambdas = new Map<Lambda, string>();
  const overrides: Record<string, PathOverride> = {};
  for (const [path, output] of Object.entries(buildResult.output)) {
    const normalizedPath = stripDuplicateSlashes(path);
    if (isLambda(output)) {
      await writeLambda(outputDir, output, normalizedPath, lambdas);
    } else if (isPrerender(output)) {
      await writeLambda(outputDir, output.lambda, normalizedPath, lambdas);

      // Write the fallback file alongside the Lambda directory
      let fallback = output.fallback;
      if (fallback) {
        const ext = getFileExtension(fallback);
        const fallbackName = `${normalizedPath}.prerender-fallback${ext}`;
        const fallbackPath = join(outputDir, 'functions', fallbackName);
        const stream = fallback.toStream();
        await pipe(
          stream,
          fs.createWriteStream(fallbackPath, { mode: fallback.mode })
        );
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
        cleanUrls
      );
    } else if (isEdgeFunction(output)) {
      await writeEdgeFunction(outputDir, output, normalizedPath);
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
  outputDir: string,
  buildResult: BuildResultV3,
  build: Builder
) {
  const { output } = buildResult;
  const src = build.src;
  if (typeof src !== 'string') {
    throw new Error(`Expected "build.src" to be a string`);
  }
  const ext = extname(src);
  const path = stripDuplicateSlashes(
    build.config?.zeroConfig ? src.substring(0, src.length - ext.length) : src
  );
  if (isLambda(output)) {
    await writeLambda(outputDir, output, path);
  } else if (isEdgeFunction(output)) {
    await writeEdgeFunction(outputDir, output, path);
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

  // TODO: handle (or skip) symlinks?
  const stream = file.toStream();
  await pipe(stream, fs.createWriteStream(dest, { mode: file.mode }));
}

/**
 * Serializes the `EdgeFunction` instance to the file system.
 *
 * @param edgeFunction The `EdgeFunction` instance
 * @param path The URL path where the `EdgeFunction` can be accessed from
 */
async function writeEdgeFunction(
  outputDir: string,
  edgeFunction: EdgeFunction,
  path: string
) {
  const dest = join(outputDir, 'functions', `${path}.func`);

  await fs.mkdirp(dest);
  const ops: Promise<any>[] = [];
  ops.push(download(edgeFunction.files, dest));

  const config = {
    runtime: 'edge',
    ...edgeFunction,
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
 * @param lambda The `Lambda` instance
 * @param path The URL path where the `Lambda` can be accessed from
 * @param lambdas (optional) Map of `Lambda` instances that have previously been written
 */
async function writeLambda(
  outputDir: string,
  lambda: Lambda,
  path: string,
  lambdas?: Map<Lambda, string>
) {
  const dest = join(outputDir, 'functions', `${path}.func`);

  // If the `lambda` has already been written to the filesystem at a different
  // location then create a symlink to the previous location instead of copying
  // the files again.
  const existingLambdaPath = lambdas?.get(lambda);
  if (existingLambdaPath) {
    const destDir = dirname(dest);
    const targetDest = join(
      outputDir,
      'functions',
      `${existingLambdaPath}.func`
    );
    const target = relative(destDir, targetDest);
    await fs.mkdirp(destDir);
    await fs.symlink(target, dest);
    return;
  }
  lambdas?.set(lambda, path);

  await fs.mkdirp(dest);
  const ops: Promise<any>[] = [];
  if (lambda.files) {
    // `files` is defined
    ops.push(download(lambda.files, dest));
  } else if (lambda.zipBuffer) {
    // Builders that use the deprecated `createLambda()` might only have `zipBuffer`
    ops.push(unzip(lambda.zipBuffer, dest));
  } else {
    throw new Error('Malformed `Lambda` - no "files" present');
  }

  const config = {
    ...lambda,
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
  await fs.copy(buildResult.buildOutputPath, outputDir);
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
