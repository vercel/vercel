import { join, sep, dirname } from 'path';
import { readFile, writeFile, pathExists, move } from 'fs-extra';

import {
  glob,
  download,
  createLambda,
  getWriteableDirectory,
  BuildOptions,
  shouldServe,
  Files,
} from '@now/build-utils';

import { createGo, getAnalyzedEntrypoint } from './go-helpers';

interface Analyzed {
  packageName: string;
  functionName: string;
  watch: string[];
}
interface BuildParamsMeta {
  isDev: boolean | undefined;
}
interface BuildParamsType extends BuildOptions {
  files: Files;
  entrypoint: string;
  workPath: string;
  meta: BuildParamsMeta;
}

export const version = 2;

export const config = {
  maxLambdaSize: '10mb',
};

export async function build({
  files,
  entrypoint,
  config,
  meta = {} as BuildParamsMeta,
}: BuildParamsType) {
  console.log('Downloading user files...');
  const entrypointArr = entrypoint.split(sep);

  let [goPath, outDir] = await Promise.all([
    getWriteableDirectory(),
    getWriteableDirectory(),
  ]);
  if (meta.isDev) {
    const devGoPath = `dev${entrypointArr[entrypointArr.length - 1]}`;
    const goPathArr = goPath.split(sep);
    goPathArr.pop();
    goPathArr.push(devGoPath);
    goPath = goPathArr.join(sep);
  }

  const srcPath = join(goPath, 'src', 'lambda');
  const downloadedFiles = await download(files, srcPath);

  console.log(`Parsing AST for "${entrypoint}"`);
  let analyzed: string;
  try {
    analyzed = await getAnalyzedEntrypoint(downloadedFiles[entrypoint].fsPath);
  } catch (err) {
    console.log(`Failed to parse AST for "${entrypoint}"`);
    throw err;
  }

  if (!analyzed) {
    const err = new Error(
      `Could not find an exported function in "${entrypoint}"`
    );
    console.log(err.message);
    throw err;
  }

  const parsedAnalyzed = JSON.parse(analyzed) as Analyzed;

  const handlerFunctionName = parsedAnalyzed.functionName;
  console.log(
    `Found exported function "${handlerFunctionName}" in "${entrypoint}"`
  );

  // we need `main.go` in the same dir as the entrypoint,
  // otherwise `go build` will refuse to build
  const entrypointDirname = dirname(downloadedFiles[entrypoint].fsPath);

  // check if package name other than main
  const packageName = parsedAnalyzed.packageName;
  const isGoModExist = await pathExists(join(entrypointDirname, 'go.mod'));
  if (packageName !== 'main') {
    const go = await createGo(
      goPath,
      process.platform,
      process.arch,
      {
        cwd: entrypointDirname,
      },
      true
    );
    if (!isGoModExist) {
      try {
        const defaultGoModContent = `module ${packageName}`;

        await writeFile(join(entrypointDirname, 'go.mod'), defaultGoModContent);
      } catch (err) {
        console.log(`failed to create default go.mod for ${packageName}`);
        throw err;
      }
    }

    const mainModGoFileName = 'main__mod__.go';
    const modMainGoContents = await readFile(
      join(__dirname, mainModGoFileName),
      'utf8'
    );

    let goPackageName = `${packageName}/${packageName}`;
    const goFuncName = `${packageName}.${handlerFunctionName}`;

    if (isGoModExist) {
      const goModContents = await readFile(
        join(entrypointDirname, 'go.mod'),
        'utf8'
      );
      const usrModName = goModContents.split('\n')[0].split(' ')[1];
      goPackageName = `${usrModName}/${packageName}`;
    }

    const mainModGoContents = modMainGoContents
      .replace('__NOW_HANDLER_PACKAGE_NAME', goPackageName)
      .replace('__NOW_HANDLER_FUNC_NAME', goFuncName);

    // write main__mod__.go
    await writeFile(
      join(entrypointDirname, mainModGoFileName),
      mainModGoContents
    );

    // move user go file to folder
    try {
      // default path
      let finalDestination = join(entrypointDirname, packageName, entrypoint);
      let forceMove = false;

      if (meta.isDev) {
        forceMove = true;
      }

      // if `entrypoint` include folder, only use filename
      if (entrypointArr.length > 1) {
        finalDestination = join(
          entrypointDirname,
          packageName,
          entrypointArr[entrypointArr.length - 1]
        );
      }

      await move(downloadedFiles[entrypoint].fsPath, finalDestination, {
        overwrite: forceMove,
      });
    } catch (err) {
      console.log('failed to move entry to package folder');
      throw err;
    }

    if (meta.isDev) {
      const isGoModBk = await pathExists(join(entrypointDirname, 'go.mod.bk'));
      if (isGoModBk) {
        await move(
          join(entrypointDirname, 'go.mod.bk'),
          join(entrypointDirname, 'go.mod'),
          { overwrite: true }
        );
        await move(
          join(entrypointDirname, 'go.sum.bk'),
          join(entrypointDirname, 'go.sum'),
          { overwrite: true }
        );
      }
    }

    console.log('Tidy `go.mod` file...');
    try {
      // ensure go.mod up-to-date
      await go.mod();
    } catch (err) {
      console.log('failed to `go mod tidy`');
      throw err;
    }

    console.log('Running `go build`...');
    const destPath = join(outDir, 'handler');
    try {
      const src = [join(entrypointDirname, mainModGoFileName)];
      await go.build(src, destPath, config.ldsflags);
    } catch (err) {
      console.log('failed to `go build`');
      throw err;
    }
    if (meta.isDev) {
      // caching for `now dev`
      await move(
        join(entrypointDirname, 'go.mod'),
        join(entrypointDirname, 'go.mod.bk'),
        { overwrite: true }
      );
      await move(
        join(entrypointDirname, 'go.sum'),
        join(entrypointDirname, 'go.sum.bk'),
        { overwrite: true }
      );
    }
  } else {
    const go = await createGo(
      goPath,
      process.platform,
      process.arch,
      {
        cwd: entrypointDirname,
      },
      false
    );
    const origianlMainGoContents = await readFile(
      join(__dirname, 'main.go'),
      'utf8'
    );
    const mainGoContents = origianlMainGoContents.replace(
      '__NOW_HANDLER_FUNC_NAME',
      handlerFunctionName
    );

    // in order to allow the user to have `main.go`,
    // we need our `main.go` to be called something else
    const mainGoFileName = 'main__now__go__.go';

    // Go doesn't like to build files in different directories,
    // so now we place `main.go` together with the user code
    await writeFile(join(entrypointDirname, mainGoFileName), mainGoContents);

    // `go get` will look at `*.go` (note we set `cwd`), parse the `import`s
    // and download any packages that aren't part of the stdlib
    console.log('Running `go get`...');
    try {
      await go.get();
    } catch (err) {
      console.log('failed to `go get`');
      throw err;
    }

    console.log('Running `go build`...');
    const destPath = join(outDir, 'handler');
    try {
      const src = [
        join(entrypointDirname, mainGoFileName),
        downloadedFiles[entrypoint].fsPath,
      ];
      await go.build(src, destPath);
    } catch (err) {
      console.log('failed to `go build`');
      throw err;
    }
  }

  const lambda = await createLambda({
    files: await glob('**', outDir),
    handler: 'handler',
    runtime: 'go1.x',
    environment: {},
  });
  const output = {
    [entrypoint]: lambda,
  };

  let watch = parsedAnalyzed.watch;
  // if `entrypoint` located in subdirectory
  // we will need to concat it with return watch array
  if (entrypointArr.length > 1) {
    entrypointArr.pop();
    watch = parsedAnalyzed.watch.map(file => join(...entrypointArr, file));
  }

  return {
    output,
    watch,
  };
}

export { shouldServe };
