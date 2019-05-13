const path = require('path');
const { spawn } = require('child_process');
const getPort = require('get-port');
const { timeout } = require('promise-timeout');
const { existsSync, readFileSync } = require('fs');
const {
  glob,
  download,
  runNpmInstall,
  runPackageJsonScript,
  runShellScript,
} = require('@now/build-utils'); // eslint-disable-line import/no-extraneous-dependencies

function validateDistDir(distDir) {
  const distDirName = path.basename(distDir);
  if (!existsSync(distDir)) {
    const message = `Build was unable to create the distDir: ${distDirName}.`
      + '\nMake sure you mentioned the correct dist directory: https://zeit.co/docs/v2/deployments/official-builders/static-build-now-static-build/#local-development';
    throw new Error(message);
  }
}

exports.version = 2;

const nowDevScriptPorts = new Map();

exports.build = async ({
  files, entrypoint, workPath, config, meta = {},
}) => {
  console.log('downloading user files...');
  await download(files, workPath, meta);

  const mountpoint = path.dirname(entrypoint);
  const entrypointFsDirname = path.join(workPath, mountpoint);
  const distPath = path.join(
    workPath,
    path.dirname(entrypoint),
    (config && config.distDir) || 'dist',
  );

  const entrypointName = path.basename(entrypoint);
  if (entrypointName === 'package.json') {
    await runNpmInstall(entrypointFsDirname, ['--prefer-offline']);

    const pkgPath = path.join(workPath, entrypoint);
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

    let output = {};
    const routes = [];

    if (meta.isDev && pkg.scripts && pkg.scripts['now-dev']) {
      let devPort = nowDevScriptPorts.get(entrypoint);
      if (typeof devPort === 'number') {
        console.log('`now-dev` server already running for %j', entrypoint);
      } else {
        // Run the `now-dev` script out-of-bounds, since it is assumed that
        // it will launch a dev server that never "completes"
        devPort = await getPort();
        nowDevScriptPorts.set(entrypoint, devPort);
        const opts = {
          cwd: entrypointFsDirname,
          env: { ...process.env, PORT: String(devPort) },
        };
        const child = spawn('yarn', ['run', 'now-dev'], opts);
        child.on('exit', () => nowDevScriptPorts.delete(entrypoint));
        child.stdout.setEncoding('utf8');
        child.stdout.pipe(process.stdout);
        child.stderr.setEncoding('utf8');
        child.stderr.pipe(process.stderr);

        // Now wait for the server to have listened on `$PORT`, after which we
        // will ProxyPass any requests to that development server that come in
        // for this builder.
        try {
          await timeout(
            new Promise((resolve) => {
              const checkForPort = (data) => {
                // Check the logs for the URL being printed with the port number
                // (i.e. `http://localhost:47521`).
                if (data.indexOf(`:${devPort}`) !== -1) {
                  resolve();
                }
              };
              child.stdout.on('data', checkForPort);
              child.stderr.on('data', checkForPort);
            }),
            5 * 60 * 1000,
          );
        } catch (err) {
          throw new Error(
            `Failed to detect a server running on port ${devPort}.\nDetails: https://err.sh/zeit/now-builders/now-static-build-failed-to-detect-a-server`,
          );
        }

        console.log('Detected dev server for %j', entrypoint);
      }

      let srcBase = mountpoint.replace(/^\.\/?/, '');
      if (srcBase.length > 0) {
        srcBase = `/${srcBase}`;
      }
      routes.push({
        src: `${srcBase}/(.*)`,
        dest: `http://localhost:${devPort}/$1`,
      });
    } else {
      if (meta.isDev) {
        console.log('WARN: "now-dev" script is missing from package.json');
        console.log(
          'See the local development docs: http://zeit.co/docs/v2/deployments/official-builders/static-now-static#local-development',
        );
      }
      // Run the `now-build` script and wait for completion to collect the build
      // outputs
      console.log('running user "now-build" script from `package.json`...');
      if (!(await runPackageJsonScript(entrypointFsDirname, 'now-build'))) {
        throw new Error(
          `An error running "now-build" script in "${entrypoint}"`,
        );
      }
      validateDistDir(distPath);
      output = await glob('**', distPath, mountpoint);
    }
    const watch = [path.join(mountpoint.replace(/^\.\/?/, ''), '**/*')];
    return { routes, watch, output };
  }

  if (path.extname(entrypoint) === '.sh') {
    await runShellScript(path.join(workPath, entrypoint));
    validateDistDir(distPath);
    return glob('**', distPath, mountpoint);
  }

  throw new Error('Proper build script must be specified as entrypoint');
};
