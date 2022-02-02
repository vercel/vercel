import fs from 'fs-extra';
import { dirname, extname, join } from 'path';
import {
  Builder,
  BuildResultV2,
  BuildResultV3,
  File,
  FrameworkBuilder,
  FunctionBuilder,
  Lambda,
  PackageJson,
} from '@vercel/build-utils';
import pipe from 'promisepipe';

export const OUTPUT_DIR = '.vercel/output';

export async function writeBuildResult(
  buildResult: BuildResultV2 | BuildResultV3,
  build: Builder,
  builder: FrameworkBuilder | FunctionBuilder,
  builderPkg: PackageJson
) {
  const { version } = builder;
  if (version === 2) {
    return writeBuildResultV2(buildResult as BuildResultV2, build, builderPkg);
  } else if (version === 3) {
    return writeBuildResultV3(buildResult as BuildResultV3, build, builderPkg);
  }
  throw new Error(
    `Unsupported Builder version \`${version}\` from "${builderPkg.name}"`
  );
}

async function writeBuildResultV2(
  buildResult: BuildResultV2,
  build: Builder,
  builderPkg: PackageJson
) {
  const output: { [path: string]: any } = {};
  for (const [path, file] of Object.entries(buildResult.output)) {
    console.log({ path, file });
    if (file.type === 'Lambda') {
      await writeLambda(file as Lambda, path);
      output[path] = {
        ...file,
        zipBuffer: undefined,
      };
    } else if (file.type === 'FileFsRef') {
      const ext = extname(file.fsPath!);
      // TODO get ext from `mimeTypes.extension()` if `ext` is empty
      let fsPath = path;
      if (extname(path) !== ext) {
        fsPath += ext;
      }
      await writeFile(file, fsPath);
      output[path] = {
        ...file,
        fsPath,
      };
    }
    // TODO: handle `FileBlob`
  }
  await writeMeta(
    {
      ...buildResult,
      output,
    },
    build.src!,
    builderPkg
  );
}

async function writeBuildResultV3(
  buildResult: BuildResultV3,
  build: Builder,
  builderPkg: PackageJson
) {
  const { output } = buildResult;
  if (output.type === 'Lambda') {
    await Promise.all([
      writeLambda(output, build.src!),
      writeMeta(
        {
          ...buildResult,
          output: {
            ...output,
            zipBuffer: undefined,
          },
          watch: undefined,
        },
        build.src!,
        builderPkg
      ),
    ]);
  } else {
    throw new Error(`Unsupported output type: "${output.type}`);
  }
}

async function writeMeta(metadata: any, path: string, builderPkg: PackageJson) {
  const dest = join(OUTPUT_DIR, 'meta', `${path}.build-result.json`);
  await fs.mkdirp(dirname(dest));
  const json = {
    ...metadata,
    builder: {
      name: builderPkg.name,
      version: builderPkg.version,
      //apiVersion: builder.version
    },
    watch: undefined,
  };
  await fs.writeJSON(dest, json, {
    spaces: 2,
  });
}

async function writeFile(file: File, path: string) {
  // TODO: handle (or skip) symlinks?
  const dest = join(OUTPUT_DIR, 'static', path);
  await fs.mkdirp(dirname(dest));
  const stream = file.toStream();
  await pipe(stream, fs.createWriteStream(dest, { mode: file.mode }));
}

async function writeLambda(lambda: Lambda, path: string) {
  const dest = join(OUTPUT_DIR, 'functions', `${path}.zip`);
  await fs.mkdirp(dirname(dest));
  await fs.writeFile(dest, lambda.zipBuffer);
}
