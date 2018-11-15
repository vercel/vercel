const { createLambda } = require('@now/build-utils/lambda.js');
const download = require('@now/build-utils/fs/download.js');
const FileFsRef = require('@now/build-utils/file-fs-ref.js');
const FileBlob = require('@now/build-utils/file-blob');
const path = require('path');
const { readFile, writeFile, unlink } = require('fs.promised');
const rename = require('@now/build-utils/fs/rename.js');
const {
  runNpmInstall,
  runPackageJsonScript
} = require('@now/build-utils/fs/run-user-scripts.js');
const glob = require('@now/build-utils/fs/glob.js');

// Exclude certain files from the files object
function excludeFiles(files, matchFn) {
  return Object.keys(files).reduce((newFiles, fileName) => {
    if (matchFn(fileName)) {
      return newFiles;
    }
    return {
      ...newFiles,
      [fileName]: files[fileName]
    };
  }, {});
}

function shouldExcludeFile(entryDirectory) {
  return file => {
    // If the file is not in the entry directory
    if (entryDirectory !== '.' && !file.startsWith(entryDirectory)) {
      return true;
    }

    // Exclude static directory
    if (file.startsWith(path.join(entryDirectory, 'static'))) {
      return true;
    }

    if (file === 'package-lock.json') {
      return true;
    }

    if (file === 'yarn.lock') {
      return true;
    }

    return false;
  };
}

exports.build = async ({ files, workPath, entrypoint }) => {
  if (
    !/package\.json$/.exec(entrypoint) &&
    !/next\.config\.js$/.exec(entrypoint)
  ) {
    throw new Error(
      'Specified "src" for "@now/next" has to be "package.json" or "next.config.js"'
    );
  }

  console.log('downloading user files...');
  const entryDirectory = path.dirname(entrypoint);
  const filesToDownload = excludeFiles(
    files,
    shouldExcludeFile(entryDirectory)
  );
  const entrypointHandledFilesToDownload = rename(filesToDownload, file => {
    if (entryDirectory !== '.') {
      return file.replace(new RegExp(`^${entryDirectory}/`), '');
    }
    return file;
  });
  let downloadedFiles = await download(
    entrypointHandledFilesToDownload,
    workPath
  );

  let packageJson = {};
  if (downloadedFiles['package.json']) {
    console.log('found package.json, overwriting');
    const packageJsonPath = downloadedFiles['package.json'].fsPath;
    packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  }

  packageJson = {
    ...packageJson,
    dependencies: {
      ...packageJson.dependencies,
      'next-server': 'canary'
    },
    devDependencies: {
      ...packageJson.devDependencies,
      next: 'canary'
    },
    scripts: {
      ...packageJson.scripts,
      'now-build': 'next build'
    }
  };

  if (!packageJson.dependencies.react) {
    console.log(
      '"react" not found in dependencies, adding to "package.json" "dependencies"'
    );
    packageJson.dependencies.react = 'latest';
  }
  if (!packageJson.dependencies['react-dom']) {
    console.log(
      '"react-dom" not found in dependencies, adding to "package.json" "dependencies"'
    );
    packageJson.dependencies['react-dom'] = 'latest';
  }

  // in case the user has `next` on their `dependencies`, we remove it
  delete packageJson.dependencies.next;

  await writeFile(
    path.join(workPath, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  if (process.env.NPM_AUTH_TOKEN) {
    console.log('found NPM_AUTH_TOKEN in environment, creating .npmrc');
    await writeFile(
      path.join(workPath, '.npmrc'),
      `//registry.npmjs.org/:_authToken=${process.env.NPM_AUTH_TOKEN}`
    );
  }
  downloadedFiles = await glob('**', workPath);

  console.log('running npm install...');
  await runNpmInstall(workPath, ['--prefer-offline']);
  console.log('running user script...');
  await runPackageJsonScript(workPath, 'now-build');
  console.log('running npm install --production...');
  await runNpmInstall(workPath, ['--prefer-offline', '--production']);
  if (process.env.NPM_AUTH_TOKEN) {
    await unlink(path.join(workPath, '.npmrc'));
  }
  downloadedFiles = await glob('**', workPath);

  console.log('preparing lambda files...');
  let buildId;
  try {
    buildId = await readFile(path.join(workPath, '.next', 'BUILD_ID'), 'utf8');
  } catch (err) {
    console.error(
      'BUILD_ID not found in ".next". The "package.json" "build" script did not run "next build"'
    );
    throw new Error('Missing BUILD_ID');
  }
  const dotNextRootFiles = await glob('.next/*', workPath);
  const dotNextServerRootFiles = await glob('.next/server/*', workPath);
  const nodeModules = excludeFiles(
    await glob('node_modules/**', workPath),
    file => file.startsWith('node_modules/.cache')
  );
  const launcherFiles = {
    'now__bridge.js': new FileFsRef({ fsPath: require('@now/node-bridge') })
  };
  const nextFiles = {
    ...nodeModules,
    ...dotNextRootFiles,
    ...dotNextServerRootFiles,
    ...launcherFiles
  };
  if (downloadedFiles['next.config.js']) {
    nextFiles['next.config.js'] = downloadedFiles['next.config.js'];
  }
  const pages = await glob(
    '**/*.js',
    path.join(workPath, '.next', 'server', 'static', buildId, 'pages')
  );
  const launcherPath = path.join(__dirname, 'launcher.js');
  const launcherData = await readFile(launcherPath, 'utf8');

  const lambdas = {};
  await Promise.all(
    Object.keys(pages).map(async page => {
      // These default pages don't have to be handled as they'd always 404
      if (['_app.js', '_error.js', '_document.js'].includes(page)) {
        return;
      }

      const pathname = page.replace(/\.js$/, '');
      const launcher = launcherData.replace(
        'PATHNAME_PLACEHOLDER',
        `/${pathname.replace(/(^|\/)index$/, '')}`
      );

      const pageFiles = {
        [`.next/server/static/${buildId}/pages/_document.js`]: downloadedFiles[
          `.next/server/static/${buildId}/pages/_document.js`
        ],
        [`.next/server/static/${buildId}/pages/_app.js`]: downloadedFiles[
          `.next/server/static/${buildId}/pages/_app.js`
        ],
        [`.next/server/static/${buildId}/pages/_error.js`]: downloadedFiles[
          `.next/server/static/${buildId}/pages/_error.js`
        ],
        [`.next/server/static/${buildId}/pages/${page}`]: downloadedFiles[
          `.next/server/static/${buildId}/pages/${page}`
        ]
      };

      lambdas[path.join(entryDirectory, pathname)] = await createLambda({
        files: {
          ...nextFiles,
          ...pageFiles,
          'now__launcher.js': new FileBlob({ data: launcher })
        },
        handler: 'now__launcher.launcher',
        runtime: 'nodejs8.10'
      });
    })
  );

  const nextStaticFiles = await glob(
    '**',
    path.join(workPath, '.next', 'static')
  );
  const staticFiles = Object.keys(nextStaticFiles).reduce(
    (mappedFiles, file) => ({
      ...mappedFiles,
      [path.join(entryDirectory, `_next/static/${file}`)]: nextStaticFiles[file]
    }),
    {}
  );

  return { ...lambdas, ...staticFiles };
};

exports.prepareCache = async ({ files, cachePath, workPath }) => {
  console.log('downloading user files...');
  await download(files, cachePath);
  await download(await glob('.next/**', workPath), cachePath);
  await download(await glob('node_modules/**', workPath), cachePath);

  console.log('.next folder contents', await glob('.next/**', cachePath));
  console.log(
    '.cache folder contents',
    await glob('node_modules/.cache/**', cachePath)
  );

  console.log('running npm install...');
  await runNpmInstall(cachePath);

  return {
    ...(await glob('.next/records.json', cachePath)),
    ...(await glob('.next/server/records.json', cachePath)),
    ...(await glob('node_modules/**', cachePath)),
    ...(await glob('yarn.lock', cachePath))
  };
};
