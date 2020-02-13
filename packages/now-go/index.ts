import { join, sep, dirname, basename, normalize } from 'path';
import { readFile, writeFile, pathExists, move } from 'fs-extra';
import { homedir } from 'os';
import execa from 'execa';

import {
  glob,
  download,
  createLambda,
  getWriteableDirectory,
  BuildOptions,
  shouldServe,
  Files,
  debug,
} from '@now/build-utils';

import { createGo, getAnalyzedEntrypoint, OUT_EXTENSION } from './go-helpers';
const handlerFileName = `handler${OUT_EXTENSION}`;

interface Analyzed {
  found?: boolean;
  packageName: string;
  functionName: string;
  watch: string[];
}

// Initialize private git repo for Go Modules
async function initPrivateGit(credentials: string) {
  await execa('git', [
    'config',
    '--global',
    'credential.helper',
    `store --file ${join(homedir(), '.git-credentials')}`,
  ]);

  await writeFile(join(homedir(), '.git-credentials'), credentials);
}

/**
 * Since `go build` does not support files that begin with a square bracket,
 * we must rename to something temporary to support Path Segments.
 * The output file is not renamed because v3 builders can't rename outputs
 * which works great for this feature.
 */
async function getRenamedEntrypoint(entrypoint: string, files: Files) {
  const filename = basename(entrypoint);
  if (filename.startsWith('[')) {
    const newEntrypoint = entrypoint.replace('/[', '/now-bracket[');
    const file = files[entrypoint];
    delete files[entrypoint];
    files[newEntrypoint] = file;
    debug(`Renamed entrypoint from ${entrypoint} to ${newEntrypoint}`);
    entrypoint = newEntrypoint;
  }

  return entrypoint;
}

export const version = 3;

export async function build({
  files,
  entrypoint,
  config,
  workPath,
  meta = {},
}: BuildOptions) {
  if (process.env.GIT_CREDENTIALS && !meta.isDev) {
    debug('Initialize Git credentials...');
    await initPrivateGit(process.env.GIT_CREDENTIALS);
  }

  if (process.env.GO111MODULE) {
    console.log(`\nManually assigning 'GO111MODULE' is not recommended.

By default:
  - 'GO111MODULE=on' If entrypoint package name is not 'main'
  - 'GO111MODULE=off' If entrypoint package name is 'main'

We highly recommend you leverage Go Modules in your project.
Learn more: https://github.com/golang/go/wiki/Modules
`);
  }
  entrypoint = await getRenamedEntrypoint(entrypoint, files);
  const entrypointArr = entrypoint.split(sep);

  // eslint-disable-next-line prefer-const
  let [goPath, outDir] = await Promise.all([
    getWriteableDirectory(),
    getWriteableDirectory(),
  ]);

  const srcPath = join(goPath, 'src', 'lambda');
  const downloadPath = meta.isDev ? workPath : srcPath;
  let downloadedFiles = await download(files, downloadPath, meta);

  debug(`Parsing AST for "${entrypoint}"`);
  let analyzed: string;
  try {
    let goModAbsPathDir = '';
    for (const file of Object.keys(downloadedFiles)) {
      if (file === 'go.mod') {
        goModAbsPathDir = dirname(downloadedFiles[file].fsPath);
        debug(`Found go.mod file in "${goModAbsPathDir}"`);
      }
    }
    analyzed = await getAnalyzedEntrypoint(
      downloadedFiles[entrypoint].fsPath,
      goModAbsPathDir
    );
  } catch (err) {
    console.log(`Failed to parse AST for "${entrypoint}"`);
    throw err;
  }

  if (!analyzed) {
    const err = new Error(
      `Could not find an exported function in "${entrypoint}"
Learn more: https://zeit.co/docs/v2/advanced/builders/#go
      `
    );
    console.log(err.message);
    throw err;
  }

  const parsedAnalyzed = JSON.parse(analyzed) as Analyzed;

  if (meta.isDev) {
    let base = null;

    if (config && config.zeroConfig) {
      base = workPath;
    } else {
      base = dirname(downloadedFiles['now.json'].fsPath);
    }

    const destNow = join(
      base,
      '.now',
      'cache',
      basename(entrypoint, '.go'),
      'src',
      'lambda'
    );
    // this will ensure Go rebuilt fast
    goPath = join(base, '.now', 'cache', basename(entrypoint, '.go'));
    await download(downloadedFiles, destNow);

    downloadedFiles = await glob('**', destNow);
  }

  // find `go.mod` in downloadedFiles
  const entrypointDirname = dirname(downloadedFiles[entrypoint].fsPath);
  let isGoModExist = false;
  let goModPath = '';
  let isGoModInRootDir = false;
  for (const file of Object.keys(downloadedFiles)) {
    const { fsPath } = downloadedFiles[file];
    const fileDirname = dirname(fsPath);
    if (file === 'go.mod') {
      isGoModExist = true;
      isGoModInRootDir = true;
      goModPath = fileDirname;
      debug(
        `Found downloaded files go.mod file: ${JSON.stringify({
          isGoModExist,
          isGoModInRootDir,
          goModPath,
        })}`
      );
    } else if (file.endsWith('go.mod')) {
      debug(`Found file that ends with "go.mod": ${file}`);

      if (entrypointDirname === fileDirname) {
        isGoModExist = true;
        goModPath = fileDirname;
        debug(
          `Found downloaded file dirname equals entrypoint dirname: ${JSON.stringify(
            { isGoModExist, isGoModInRootDir, goModPath }
          )}`
        );
        break;
      }

      // TODO: test windows here
      if (config.zeroConfig && file === 'api/go.mod') {
        isGoModExist = true;
        isGoModInRootDir = true;
        goModPath = join(fileDirname, '..');
        debug(
          `Moving api/go.mod to go.mod: ${JSON.stringify({
            isGoModExist,
            isGoModInRootDir,
            goModPath,
          })}`
        );
        const pathParts = fsPath.split(sep);
        pathParts.pop(); // Remove go.mod
        pathParts.pop(); // Remove api
        pathParts.push('go.mod');
        const newFsPath = pathParts.join(sep);
        await move(fsPath, newFsPath);
        break;
      }
    }
  }

  const input = entrypointDirname;
  const includedFiles: Files = {};

  if (config && config.includeFiles) {
    const patterns = Array.isArray(config.includeFiles)
      ? config.includeFiles
      : [config.includeFiles];
    for (const pattern of patterns) {
      const fsFiles = await glob(pattern, input);
      for (const [assetName, asset] of Object.entries(fsFiles)) {
        includedFiles[assetName] = asset;
      }
    }
  }

  const handlerFunctionName = parsedAnalyzed.functionName;
  debug(`Found exported function "${handlerFunctionName}" in "${entrypoint}"`);

  if (!isGoModExist && 'vendor' in downloadedFiles) {
    throw new Error('`go.mod` is required to use a `vendor` directory.');
  }

  // check if package name other than main
  // using `go.mod` way building the handler
  const packageName = parsedAnalyzed.packageName;

  if (isGoModExist && packageName === 'main') {
    throw new Error('Please change `package main` to `package handler`');
  }

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
        console.log(`Failed to create default go.mod for ${packageName}`);
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
      const goModContents = await readFile(join(goModPath, 'go.mod'), 'utf8');
      const usrModName = goModContents.split('\n')[0].split(' ')[1];
      debug(JSON.stringify({ usrModName, entrypointArr }));
      if (entrypointArr.length > 1 && isGoModInRootDir) {
        const cleanPackagePath = [...entrypointArr];
        cleanPackagePath.pop();
        goPackageName = `${usrModName}/${cleanPackagePath.join('/')}`;
      } else {
        goPackageName = `${usrModName}/${packageName}`;
      }
    }

    debug(JSON.stringify({ goPackageName, goFuncName }));

    const mainModGoContents = modMainGoContents
      .replace('__NOW_HANDLER_PACKAGE_NAME', goPackageName)
      .replace('__NOW_HANDLER_FUNC_NAME', goFuncName);

    if (meta.isDev && isGoModExist && isGoModInRootDir) {
      const mainDir = dirname(downloadedFiles['go.mod'].fsPath);
      await writeFile(join(mainDir, mainModGoFileName), mainModGoContents);
      debug('[dev] Write main file to ' + mainDir);
    } else if (isGoModExist && isGoModInRootDir) {
      debug('[mod-root] Write main file to ' + srcPath);
      await writeFile(join(srcPath, mainModGoFileName), mainModGoContents);
    } else if (isGoModExist && !isGoModInRootDir) {
      debug('[mod-other] Write main file to ' + goModPath);
      await writeFile(join(goModPath, mainModGoFileName), mainModGoContents);
    } else {
      debug('[entrypoint] Write main file to ' + entrypointDirname);
      await writeFile(
        join(entrypointDirname, mainModGoFileName),
        mainModGoContents
      );
    }

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

      if (
        dirname(downloadedFiles[entrypoint].fsPath) === goModPath ||
        !isGoModExist
      ) {
        await move(downloadedFiles[entrypoint].fsPath, finalDestination, {
          overwrite: forceMove,
        });
      }
    } catch (err) {
      console.log('Failed to move entry to package folder');
      throw err;
    }

    let baseGoModPath = '';
    if (meta.isDev && isGoModExist && isGoModInRootDir) {
      baseGoModPath = dirname(downloadedFiles['go.mod'].fsPath);
    } else if (isGoModExist && isGoModInRootDir) {
      baseGoModPath = srcPath;
    } else if (isGoModExist && !isGoModInRootDir) {
      baseGoModPath = goModPath;
    } else {
      baseGoModPath = entrypointDirname;
    }

    debug(JSON.stringify({ srcPath, goModPath, baseGoModPath }));

    if (meta.isDev) {
      const isGoModBk = await pathExists(join(baseGoModPath, 'go.mod.bk'));
      if (isGoModBk) {
        await move(
          join(baseGoModPath, 'go.mod.bk'),
          join(baseGoModPath, 'go.mod'),
          { overwrite: true }
        );
        await move(
          join(baseGoModPath, 'go.sum.bk'),
          join(baseGoModPath, 'go.sum'),
          { overwrite: true }
        );
      }
    }

    debug('Tidy `go.mod` file...');
    try {
      // ensure go.mod up-to-date
      await go.mod();
    } catch (err) {
      console.log('failed to `go mod tidy`');
      throw err;
    }

    debug('Running `go build`...');
    const destPath = join(outDir, handlerFileName);

    try {
      const src = [join(baseGoModPath, mainModGoFileName)];

      await go.build(src, destPath);
    } catch (err) {
      console.log('failed to `go build`');
      throw err;
    }
    if (meta.isDev) {
      // caching for `now dev`
      await move(
        join(baseGoModPath, 'go.mod'),
        join(baseGoModPath, 'go.mod.bk'),
        { overwrite: true }
      );
      await move(
        join(baseGoModPath, 'go.sum'),
        join(baseGoModPath, 'go.sum.bk'),
        { overwrite: true }
      );
    }
  } else {
    // legacy mode
    // we need `main.go` in the same dir as the entrypoint,
    // otherwise `go build` will refuse to build
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
    debug('Running `go get`...');
    try {
      await go.get();
    } catch (err) {
      console.log('Failed to `go get`');
      throw err;
    }

    debug('Running `go build`...');
    const destPath = join(outDir, handlerFileName);
    try {
      const src = [
        join(entrypointDirname, mainGoFileName),
        downloadedFiles[entrypoint].fsPath,
      ].map(file => normalize(file));
      await go.build(src, destPath);
    } catch (err) {
      console.log('failed to `go build`');
      throw err;
    }
  }

  const lambda = await createLambda({
    files: { ...(await glob('**', outDir)), ...includedFiles },
    handler: handlerFileName,
    runtime: 'go1.x',
    environment: {},
  });

  const watch = parsedAnalyzed.watch;
  let watchSub: string[] = [];
  // if `entrypoint` located in subdirectory
  // we will need to concat it with return watch array
  if (entrypointArr.length > 1) {
    entrypointArr.pop();
    watchSub = parsedAnalyzed.watch.map(file => join(...entrypointArr, file));
  }

  return {
    output: lambda,
    watch: watch.concat(watchSub),
  };
}

export { shouldServe };
