import fs from 'fs-extra';
import { dirname, extname, join } from 'path';
import {
  Builder,
  BuildResultV2,
  BuildResultV3,
  File,
  BuilderV2,
  BuilderV3,
  Lambda,
  PackageJson,
  download,
} from '@vercel/build-utils';
import pipe from 'promisepipe';

export const OUTPUT_DIR = '.vercel/output';

export async function writeBuildResult(
  buildResult: BuildResultV2 | BuildResultV3,
  build: Builder,
  builder: BuilderV2 | BuilderV3,
  builderPkg: PackageJson
) {
  const { version } = builder;
  if (version === 2) {
    return writeBuildResultV2(buildResult as BuildResultV2);
  } else if (version === 3) {
    return writeBuildResultV3(buildResult as BuildResultV3, build);
  }
  throw new Error(
    `Unsupported Builder version \`${version}\` from "${builderPkg.name}"`
  );
}

async function writeBuildResultV2(buildResult: BuildResultV2) {
  console.log(buildResult);
  const overrides: { [path: string]: any } = {};
  for (const [path, output] of Object.entries(buildResult.output)) {
    if (output.type === 'Lambda') {
      await writeLambda(output as Lambda, path);
    } else if (output.type === 'FileFsRef') {
      // TODO: properly type
      let override: any = null;

      // TODO get ext from `mimeTypes.extension()` if `ext` is empty
      const ext = extname(output.fsPath!);
      let fsPath = path;
      if (extname(path) !== ext) {
        fsPath += ext;
        if (!override) override = {};
        override.path = path;
      }

      if (output.contentType) {
        if (!override) override = {};
        override.contentType = output.contentType;
      }
      if (override) {
        overrides[fsPath] = override;
      }
      await writeStaticFile(output, fsPath);
    } else {
      // TODO: handle `FileBlob` / `FileRef`
      throw new Error(`Unsupported output type: "${output.type}" for ${path}`);
    }
  }
  const configPath = join(OUTPUT_DIR, 'config.json');
  const config = {
    routes: buildResult.routes,
    overrides,
  };
  await fs.writeJSON(configPath, config, { spaces: 2 });
}

async function writeBuildResultV3(buildResult: BuildResultV3, build: Builder) {
  const { output } = buildResult;
  if (output.type === 'Lambda') {
    await writeLambda(output, build.src!);
  } else {
    throw new Error(
      `Unsupported output type: "${output.type}" for ${build.src}`
    );
  }
}

async function writeStaticFile(file: File, path: string) {
  // TODO: handle (or skip) symlinks?
  const dest = join(OUTPUT_DIR, 'static', path);
  await fs.mkdirp(dirname(dest));
  const stream = file.toStream();
  await pipe(stream, fs.createWriteStream(dest, { mode: file.mode }));
}

async function writeLambda(lambda: Lambda, path: string) {
  const dest = join(OUTPUT_DIR, 'serverless', `${path}.func`);
  await fs.mkdirp(dest);

  const ops: Promise<any>[] = [];
  if (lambda.files) {
    // `files` is defined
    ops.push(download(lambda.files, dest));
  } else if (lambda.zipBuffer) {
    // TODO: unzip buffer to `dest`
    //await fs.writeFile(dest, lambda.zipBuffer);
  } else {
    throw new Error('Malformed `Lambda` - no "files" present');
  }

  const config = {
    ...lambda,
    files: undefined,
    zipBuffer: undefined,
  };
  ops.push(
    fs.writeJSON(join(dest, '.vc-config.json'), config, {
      spaces: 2,
    })
  );
  await Promise.all(ops);
}
