import fs from 'fs-extra';
import { basename, dirname, extname, join, relative } from 'path';
import {
  Builder,
  BuildResultV2,
  BuildResultV3,
  File,
  BuilderV2,
  BuilderV3,
  Lambda,
  PackageJson,
  Prerender,
  download,
} from '@vercel/build-utils';
import pipe from 'promisepipe';
import { unzip } from './unzip';
import { VERCEL_DIR } from '../projects/link';

export const OUTPUT_DIR = join(VERCEL_DIR, 'output');

export async function writeBuildResult(
  buildResult: BuildResultV2 | BuildResultV3,
  build: Builder,
  builder: BuilderV2 | BuilderV3,
  builderPkg: PackageJson,
  cleanUrls?: boolean
) {
  const { version } = builder;
  if (version === 2) {
    return writeBuildResultV2(buildResult as BuildResultV2, cleanUrls);
  } else if (version === 3) {
    return writeBuildResultV3(buildResult as BuildResultV3, build);
  }
  throw new Error(
    `Unsupported Builder version \`${version}\` from "${builderPkg.name}"`
  );
}

function isLambda(v: any): v is Lambda {
  return v?.type === 'Lambda';
}

function isPrerender(v: any): v is Prerender {
  return v?.type === 'Prerender';
}

export interface PathOverride {
  contentType?: string;
  path?: string;
}

/**
 * Writes the output from the `build()` return value of a v2 Builder to
 * the filesystem.
 */
async function writeBuildResultV2(
  buildResult: BuildResultV2,
  cleanUrls?: boolean
) {
  const lambdas = new Map<Lambda, string>();
  const overrides: Record<string, PathOverride> = {};
  for (const [path, output] of Object.entries(buildResult.output)) {
    if (isLambda(output)) {
      await writeLambda(output, path, lambdas);
    } else if (isPrerender(output)) {
      await writeLambda(output.lambda, path, lambdas);

      // Write the fallback file alongside the Lambda directory
      let fallback: any = null; // TODO: properly type
      if (output.fallback) {
        let ext = '';
        if (output.fallback.type === 'FileFsRef') {
          ext = extname(output.fallback.fsPath);
        }
        const fallbackName = `${path}.prerender-fallback${ext}`;
        const fallbackPath = join(OUTPUT_DIR, 'functions', fallbackName);
        const stream = output.fallback.toStream();
        await pipe(
          stream,
          fs.createWriteStream(fallbackPath, { mode: output.fallback.mode })
        );
        fallback = {
          ...output.fallback,
          fsPath: basename(fallbackName),
        };
      }

      const prerenderConfigPath = join(
        OUTPUT_DIR,
        'functions',
        `${path}.prerender-config.json`
      );
      const prerenderConfig = {
        ...output,
        lambda: undefined,
        fallback,
      };
      await fs.writeJSON(prerenderConfigPath, prerenderConfig, { spaces: 2 });
    } else if (output.type === 'FileFsRef') {
      await writeStaticFile(output, path, overrides, cleanUrls);
    } else {
      // TODO: handle `FileBlob` / `FileRef` / `EdgeFunction`
      throw new Error(`Unsupported output type: "${output.type}" for ${path}`);
    }
  }
  return overrides;
}

/**
 * Writes the output from the `build()` return value of a v3 Builder to
 * the filesystem.
 */
async function writeBuildResultV3(buildResult: BuildResultV3, build: Builder) {
  const { output } = buildResult;
  if (isLambda(output)) {
    // TODO Is this the right place for zero config rename?
    // TODO Do we need to consider the "api" directory explicitly?
    const src = build.src!;
    const ext = extname(src);
    const path = build.config?.zeroConfig
      ? src.substring(0, src.length - ext.length)
      : src;
    await writeLambda(output, path);
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
  file: File,
  path: string,
  overrides: Record<string, PathOverride>,
  cleanUrls = false
) {
  let override: PathOverride | null = null;

  let fsPath = path;
  if (file.type === 'FileFsRef') {
    // TODO: get ext from `mimeTypes.extension()` if `ext` is empty
    const ext = extname(file.fsPath);
    if (extname(path) !== ext) {
      fsPath += ext;
      if (!override) override = {};
      override.path = path;
    }
  }

  if (cleanUrls && path.endsWith('.html')) {
    if (!override) override = {};
    override.path = path.slice(0, -5);
    override.contentType = 'text/html; charset=utf-8';
  }

  if (file.contentType) {
    if (!override) override = {};
    override.contentType = file.contentType;
  }

  if (override) {
    overrides[fsPath] = override;
  }

  // TODO: handle (or skip) symlinks?
  const dest = join(OUTPUT_DIR, 'static', fsPath);
  await fs.mkdirp(dirname(dest));
  const stream = file.toStream();
  await pipe(stream, fs.createWriteStream(dest, { mode: file.mode }));
}

/**
 * Writes the file references from the `Lambda` instance to the file system.
 *
 * @param lambda The `Lambda` instance
 * @param path The URL path where the `Lambda` can be accessed from
 * @param lambdas (optional) Map of `Lambda` instances that have previously been written
 */
async function writeLambda(
  lambda: Lambda,
  path: string,
  lambdas?: Map<Lambda, string>
) {
  const dest = join(OUTPUT_DIR, 'functions', `${path}.func`);

  // If the `lambda` has already been written to the filesystem at a different
  // location then create a symlink to the previous location instead of copying
  // the files again.
  const existingLambdaPath = lambdas?.get(lambda);
  if (existingLambdaPath) {
    const destDir = dirname(dest);
    const targetDest = join(
      OUTPUT_DIR,
      'functions',
      `${existingLambdaPath}.func`
    );
    const target = relative(destDir, targetDest);
    await fs.mkdirp(destDir);
    await fs.symlink(target, dest);
    return;
  }

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
    files: undefined,
    zipBuffer: undefined,
  };
  const configPath = join(dest, '.vc-config.json');
  ops.push(
    fs.writeJSON(configPath, config, {
      spaces: 2,
    })
  );
  lambdas?.set(lambda, path);
  await Promise.all(ops);
}
