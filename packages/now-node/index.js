const { createLambda } = require('@now/build-utils/lambda.js');
const download = require('@now/build-utils/fs/download.js');
const FileBlob = require('@now/build-utils/file-blob.js');
const FileFsRef = require('@now/build-utils/file-fs-ref.js');
const fs = require('fs');
const glob = require('@now/build-utils/fs/glob.js');
const path = require('path');
const { promisify } = require('util');
const { runNpmInstall, runPackageJsonScript
  } = require('@now/build-utils/fs/run-user-scripts.js');

const fsp = {
  readFile: promisify(fs.readFile)
};

async function commonForTwo ({ files, entrypoint, workPath, cachePath }) {
  const xPath = workPath || cachePath;
  const preferOfflineArgument = workPath ? [ '--prefer-offline' ] : [];

  const xUserPath = path.join(xPath, 'user');
  const xRollupPath = path.join(xPath, 'rollup');

  console.log('downloading user files...');
  const filesOnDisk = await download(files, xUserPath);

  console.log('running npm install for user...');
  const entrypointFsDirname = path.join(xUserPath, path.dirname(entrypoint));
  await runNpmInstall(entrypointFsDirname, preferOfflineArgument);

  console.log('writing rollup package.json...');
  await download({
    'package.json': new FileBlob({
      data: JSON.stringify({
        dependencies: {
          'builtins': '2.0.0',
          'rollup': '0.67.0',
          'rollup-plugin-commonjs': '9.2.0',
          'rollup-plugin-json': '3.1.0',
          'rollup-plugin-node-resolve': '3.4.0',
          'rollup-plugin-terser': '3.0.0'
        }
      })
    })
  }, xRollupPath);

  console.log('running npm install for rollup...');
  await runNpmInstall(xRollupPath, preferOfflineArgument);
  return [ filesOnDisk, xRollupPath, entrypointFsDirname ];
}

exports.build = async ({ files, entrypoint, workPath }) => {
  const [ filesOnDisk, workRollupPath, entrypointFsDirname ] =
    await commonForTwo({ files, entrypoint, workPath });

  console.log('running user script...');
  await runPackageJsonScript(entrypointFsDirname, 'now-build');

  console.log('compiling entrypoint with rollup...');
  const data = await compile(workRollupPath, filesOnDisk[entrypoint].fsPath);
  const blob = new FileBlob({ data });

  console.log('preparing lambda files...');
  // move all user code to 'user' subdirectory
  const compiledFiles = { [path.join('user', entrypoint)]: blob };
  const launcherPath = path.join(__dirname, 'launcher.js');
  let launcherData = await fsp.readFile(launcherPath, 'utf8');

  launcherData = launcherData.replace('// PLACEHOLDER', [
    'process.chdir("./user");',
    `listener = require("./${path.join('user', entrypoint)}");`
  ].join(' '));

  const launcherFiles = {
    'launcher.js': new FileBlob({ data: launcherData }),
    'bridge.js': new FileFsRef({ fsPath: require('@now/node-bridge') })
  };

  const lambda = await createLambda({
    files: { ...compiledFiles, ...launcherFiles },
    handler: 'launcher.launcher',
    runtime: 'nodejs8.10'
  });

  return { [entrypoint]: lambda };
};

exports.prepareCache = async ({ files, entrypoint, cachePath }) => {
  await commonForTwo({ files, entrypoint, cachePath });

  return {
    ...await glob('user/node_modules/**', cachePath),
    ...await glob('user/package-lock.json', cachePath),
    ...await glob('user/yarn.lock', cachePath),
    ...await glob('rollup/node_modules/**', cachePath),
    ...await glob('rollup/package-lock.json', cachePath),
    ...await glob('rollup/yarn.lock', cachePath)
  };
};

async function compile (workRollupPath, input) {
  const rollup = require(path.join(workRollupPath, 'node_modules/rollup'));
  const nodeResolve = require(path.join(workRollupPath, 'node_modules/rollup-plugin-node-resolve'));
  const commonjs = require(path.join(workRollupPath, 'node_modules/rollup-plugin-commonjs'));
  const json = require(path.join(workRollupPath, 'node_modules/rollup-plugin-json'));
  const { terser } = require(path.join(workRollupPath, 'node_modules/rollup-plugin-terser'));
  const builtins = require(path.join(workRollupPath, 'node_modules/builtins'))();

  const bundle = await rollup.rollup({
    input,
    plugins: [
      nodeResolve({
        module: false,
        jsnext: false,
        browser: false,
        preferBuiltins: true
      }),
      json(),
      commonjs(),
      terser()
    ],
    onwarn: function (error) {
      if (/external dependency/.test(error.message)) {
        const mod = error.message.split('\'')[1];
        // ignore rollup warnings about known node.js modules
        if (builtins.indexOf(mod) > -1) return;
      }
      console.error(error.message);
    }
  });

  return (await bundle.generate({
    format: 'cjs'
  })).code;
}
