const fs = require('fs-extra');
const path = require('path');
const execa = require('execa');
const toml = require('@iarna/toml');
const { createLambda } = require('@now/build-utils/lambda.js'); // eslint-disable-line import/no-extraneous-dependencies
const download = require('@now/build-utils/fs/download.js'); // eslint-disable-line import/no-extraneous-dependencies
const glob = require('@now/build-utils/fs/glob.js'); // eslint-disable-line import/no-extraneous-dependencies
const { runShellScript } = require('@now/build-utils/fs/run-user-scripts.js'); // eslint-disable-line import/no-extraneous-dependencies
const FileFsRef = require('@now/build-utils/file-fs-ref.js'); // eslint-disable-line import/no-extraneous-dependencies
const FileRef = require('@now/build-utils/file-ref.js'); // eslint-disable-line import/no-extraneous-dependencies
const installRust = require('./install-rust.js');

exports.config = {
  maxLambdaSize: '25mb',
};

const codegenFlags = [
  '-C',
  'target-cpu=ivybridge',
  '-C',
  'target-feature=-aes,-avx,+fxsr,-popcnt,+sse,+sse2,-sse3,-sse4.1,-sse4.2,-ssse3,-xsave,-xsaveopt',
];

async function inferCargoBinaries(config) {
  try {
    const { stdout: manifestStr } = await execa(
      'cargo',
      ['read-manifest'],
      config,
    );

    const { targets } = JSON.parse(manifestStr);

    return targets
      .filter(({ kind }) => kind.includes('bin'))
      .map(({ name }) => name);
  } catch (err) {
    console.error('failed to run `cargo read-manifest`');
    throw err;
  }
}

async function parseTOMLStream(stream) {
  return toml.parse.stream(stream);
}

async function buildWholeProject({
  entrypoint,
  downloadedFiles,
  extraFiles,
  rustEnv,
  config,
}) {
  const entrypointDirname = path.dirname(downloadedFiles[entrypoint].fsPath);
  const { debug } = config;
  console.log('running `cargo build`...');
  try {
    await execa(
      'cargo',
      ['build', '--verbose'].concat(debug ? [] : ['--release']),
      {
        env: rustEnv,
        cwd: entrypointDirname,
        stdio: 'inherit',
      },
    );
  } catch (err) {
    console.error('failed to `cargo build`');
    throw err;
  }

  const targetPath = path.join(
    entrypointDirname,
    'target',
    debug ? 'debug' : 'release',
  );
  const binaries = await inferCargoBinaries({
    env: rustEnv,
    cwd: entrypointDirname,
  });

  const lambdas = {};
  const lambdaPath = path.dirname(entrypoint);
  await Promise.all(
    binaries.map(async (binary) => {
      const fsPath = path.join(targetPath, binary);
      const lambda = await createLambda({
        files: {
          ...extraFiles,
          bootstrap: new FileFsRef({ mode: 0o755, fsPath }),
        },
        handler: 'bootstrap',
        runtime: 'provided',
      });

      lambdas[path.join(lambdaPath, binary)] = lambda;
    }),
  );

  return lambdas;
}

async function gatherExtraFiles(globMatcher, entrypoint) {
  if (!globMatcher) return {};

  console.log('gathering extra files for the fs...');

  const entryDir = path.dirname(entrypoint);

  if (Array.isArray(globMatcher)) {
    const allMatches = await Promise.all(
      globMatcher.map(pattern => glob(pattern, entryDir)),
    );

    return allMatches.reduce((acc, matches) => ({ ...acc, ...matches }), {});
  }

  return glob(globMatcher, entryDir);
}

async function runUserScripts(entrypoint) {
  const entryDir = path.dirname(entrypoint);
  const buildScriptPath = path.join(entryDir, 'build.sh');
  const buildScriptExists = await fs.exists(buildScriptPath);

  if (buildScriptExists) {
    console.log('running `build.sh`...');
    await runShellScript(buildScriptPath);
  }
}

async function cargoLocateProject(config) {
  try {
    const { stdout: projectDescriptionStr } = await execa(
      'cargo',
      ['locate-project'],
      config,
    );
    const projectDescription = JSON.parse(projectDescriptionStr);
    if (projectDescription != null && projectDescription.root != null) {
      return projectDescription.root;
    }
  } catch (e) {
    if (!/could not find/g.test(e.stderr)) {
      console.error("Couldn't run `cargo locate-project`");
      throw e;
    }
  }

  return null;
}

async function buildSingleFile({
  workPath,
  entrypoint,
  downloadedFiles,
  extraFiles,
  rustEnv,
  config,
}) {
  console.log('building single file');
  const launcherPath = path.join(__dirname, 'launcher.rs');
  let launcherData = await fs.readFile(launcherPath, 'utf8');

  const entrypointPath = downloadedFiles[entrypoint].fsPath;
  const entrypointDirname = path.dirname(entrypointPath);
  launcherData = launcherData.replace(
    '// PLACEHOLDER',
    await fs.readFile(path.join(workPath, entrypoint)),
  );
  // replace the entrypoint with one that includes the the imports + lambda.start
  await fs.remove(entrypointPath);
  await fs.writeFile(entrypointPath, launcherData);

  // Find a Cargo.toml file or TODO: create one
  const cargoTomlFile = await cargoLocateProject({
    env: rustEnv,
    cwd: entrypointDirname,
  });

  // TODO: we're assuming there's a Cargo.toml file. We need to create one
  // otherwise
  let cargoToml;
  try {
    cargoToml = await parseTOMLStream(fs.createReadStream(cargoTomlFile));
  } catch (err) {
    console.error('Failed to parse TOML from entrypoint:', entrypoint);
    throw err;
  }

  const binName = path
    .basename(entrypointPath)
    .replace(path.extname(entrypointPath), '');
  const { package: pkg, dependencies } = cargoToml;
  // default to latest now_lambda
  dependencies.now_lambda = '*';
  const tomlToWrite = toml.stringify({
    package: pkg,
    dependencies,
    bin: [
      {
        name: binName,
        path: entrypointPath,
      },
    ],
  });
  console.log('toml to write:', tomlToWrite);

  // Overwrite the Cargo.toml file with one that includes the `now_lambda`
  // dependency and our binary. `dependencies` is a map so we don't run the
  // risk of having 2 `now_lambda`s in there.
  await fs.writeFile(cargoTomlFile, tomlToWrite);

  const { debug } = config;
  console.log('running `cargo build`...');
  try {
    await execa(
      'cargo',
      ['build', '--bin', binName, '--verbose'].concat(
        debug ? [] : ['--release'],
      ),
      {
        env: rustEnv,
        cwd: entrypointDirname,
        stdio: 'inherit',
      },
    );
  } catch (err) {
    console.error('failed to `cargo build`');
    throw err;
  }

  const bin = path.join(
    path.dirname(cargoTomlFile),
    'target',
    debug ? 'debug' : 'release',
    binName,
  );

  const lambda = await createLambda({
    files: {
      ...extraFiles,
      bootstrap: new FileFsRef({ mode: 0o755, fsPath: bin }),
    },
    handler: 'bootstrap',
    runtime: 'provided',
  });

  return {
    [entrypoint]: lambda,
  };
}

exports.build = async (m) => {
  const {
    files, entrypoint, workPath, config,
  } = m;
  console.log('downloading files');
  const downloadedFiles = await download(files, workPath);
  const entryPath = downloadedFiles[entrypoint].fsPath;

  await installRust();
  const { PATH, HOME } = process.env;
  const rustEnv = {
    ...process.env,
    PATH: `${path.join(HOME, '.cargo/bin')}:${PATH}`,
    RUSTFLAGS: [process.env.RUSTFLAGS, ...codegenFlags]
      .filter(Boolean)
      .join(' '),
  };

  await runUserScripts(entryPath);
  const extraFiles = await gatherExtraFiles(config.includeFiles, entryPath);

  const newM = Object.assign(m, { downloadedFiles, extraFiles, rustEnv });
  if (path.extname(entrypoint) === '.toml') {
    return buildWholeProject(newM);
  }
  return buildSingleFile(newM);
};

exports.prepareCache = async ({ cachePath, entrypoint, workPath }) => {
  console.log('preparing cache...');

  let targetFolderDir;
  if (path.extname(entrypoint) === '.toml') {
    targetFolderDir = path.dirname(path.join(workPath, entrypoint));
  } else {
    const { PATH, HOME } = process.env;
    const rustEnv = {
      ...process.env,
      PATH: `${path.join(HOME, '.cargo/bin')}:${PATH}`,
      RUSTFLAGS: [process.env.RUSTFLAGS, ...codegenFlags]
        .filter(Boolean)
        .join(' '),
    };
    const entrypointDirname = path.dirname(path.join(workPath, entrypoint));
    const cargoTomlFile = await cargoLocateProject({
      env: rustEnv,
      cwd: entrypointDirname,
    });

    if (cargoTomlFile != null) {
      targetFolderDir = path.dirname(cargoTomlFile);
    } else {
      // `Cargo.toml` doesn't exist, in `build` we put it in the same
      // path as the entrypoint.
      targetFolderDir = path.dirname(path.join(workPath, entrypoint));
    }
  }

  const cacheEntrypointDirname = path.join(
    cachePath,
    path.relative(workPath, targetFolderDir),
  );

  // Remove the target folder to avoid 'directory already exists' errors
  fs.removeSync(path.join(cacheEntrypointDirname, 'target'));
  fs.mkdirpSync(cacheEntrypointDirname);
  // Move the target folder to the cache location
  fs.renameSync(
    path.join(targetFolderDir, 'target'),
    path.join(cacheEntrypointDirname, 'target'),
  );

  const cacheFiles = await glob('**/**', cachePath);

  // eslint-disable-next-line no-restricted-syntax
  for (const f of Object.keys(cacheFiles)) {
    const accept = /(?:^|\/)target\/release\/\.fingerprint\//.test(f)
      || /(?:^|\/)target\/release\/build\//.test(f)
      || /(?:^|\/)target\/release\/deps\//.test(f)
      || /(?:^|\/)target\/debug\/\.fingerprint\//.test(f)
      || /(?:^|\/)target\/debug\/build\//.test(f)
      || /(?:^|\/)target\/debug\/deps\//.test(f);
    if (!accept) {
      delete cacheFiles[f];
    }
  }

  return cacheFiles;
};

function findCargoToml(files, entrypoint) {
  let currentPath = path.dirname(entrypoint);
  let cargoTomlPath;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    cargoTomlPath = path.join(currentPath, 'Cargo.toml');
    if (files[cargoTomlPath]) break;
    const newPath = path.dirname(currentPath);
    if (currentPath === newPath) break;
    currentPath = newPath;
  }

  return cargoTomlPath;
}

exports.getDefaultCache = ({ files, entrypoint }) => {
  const cargoTomlPath = findCargoToml(files, entrypoint);
  if (!cargoTomlPath) return undefined;
  const targetFolderDir = path.dirname(cargoTomlPath);
  const defaultCacheRef = new FileRef({
    digest:
      'sha:204e0c840c43473bbd130d7bc704fe5588b4eab43cda9bc940f10b2a0ae14b16',
  });
  return { [targetFolderDir]: defaultCacheRef };
};
