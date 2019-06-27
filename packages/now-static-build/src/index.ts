import path from 'path';
import spawn from 'cross-spawn';
import getPort from 'get-port';
import { timeout } from 'promise-timeout';
import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import {
  glob,
  download,
  runNpmInstall,
  runPackageJsonScript,
  runShellScript,
  getNodeVersion,
  getSpawnOptions,
  Files,
  BuildOptions,
} from '@now/build-utils';

interface PackageJson {
  scripts?: {
    [key: string]: string;
  };
}

function validateDistDir(distDir: string, isDev: boolean | undefined) {
  const hash = isDev
    ? '#local-development'
    : '#configuring-the-build-output-directory';
  const docsUrl = `https://zeit.co/docs/v2/deployments/official-builders/static-build-now-static-build${hash}`;
  const distDirName = path.basename(distDir);
  if (!existsSync(distDir)) {
    const message =
      `Build was unable to create the distDir: "${distDirName}".` +
      `\nMake sure you configure the the correct distDir: ${docsUrl}`;
    throw new Error(message);
  }
  const stat = statSync(distDir);
  if (!stat.isDirectory()) {
    const message =
      `Build failed because distDir is not a directory: "${distDirName}".` +
      `\nMake sure you configure the the correct distDir: ${docsUrl}`;
    throw new Error(message);
  }

  const contents = readdirSync(distDir);
  if (contents.length === 0) {
    const message =
      `Build failed because distDir is empty: "${distDirName}".` +
      `\nMake sure you configure the the correct distDir: ${docsUrl}`;
    throw new Error(message);
  }
}

function getCommand(pkg: PackageJson, cmd: string) {
  const scripts = (pkg && pkg.scripts) || {};
  const nowCmd = `now-${cmd}`;

  if (scripts[nowCmd]) {
    return nowCmd;
  }

  if (scripts[cmd]) {
    return cmd;
  }

  return nowCmd;
}

export const version = 2;

const nowDevScriptPorts = new Map();

export async function build({
  files,
  entrypoint,
  workPath,
  config,
  meta = {},
}: BuildOptions) {
  console.log('Downloading user files...');
  await download(files, workPath, meta);

  const mountpoint = path.dirname(entrypoint);
  const entrypointFsDirname = path.join(workPath, mountpoint);
  const nodeVersion = await getNodeVersion(entrypointFsDirname);
  const spawnOpts = getSpawnOptions(meta, nodeVersion);
  const distPath = path.join(
    workPath,
    path.dirname(entrypoint),
    (config && (config.distDir as string)) || 'dist'
  );

  const entrypointName = path.basename(entrypoint);

  if (entrypointName.endsWith('.sh')) {
    console.log(`Running build script "${entrypoint}"`);
    await runShellScript(path.join(workPath, entrypoint));
    validateDistDir(distPath, meta.isDev);
    return glob('**', distPath, mountpoint);
  }

  if (entrypointName === 'package.json') {
    await runNpmInstall(entrypointFsDirname, ['--prefer-offline'], spawnOpts);

    const pkgPath = path.join(workPath, entrypoint);
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

    let output: Files = {};
    const routes: { src: string; dest: string }[] = [];
    const devScript = getCommand(pkg, 'dev');

    if (meta.isDev && pkg.scripts && pkg.scripts[devScript]) {
      let devPort = nowDevScriptPorts.get(entrypoint);
      if (typeof devPort === 'number') {
        console.log(
          '`%s` server already running for %j',
          devScript,
          entrypoint
        );
      } else {
        // Run the `now-dev` or `dev` script out-of-bounds, since it is assumed that
        // it will launch a dev server that never "completes"
        devPort = await getPort();
        nowDevScriptPorts.set(entrypoint, devPort);
        const opts = {
          cwd: entrypointFsDirname,
          env: { ...process.env, PORT: String(devPort) },
        };
        const child = spawn('npm', ['run', devScript], opts);
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
            new Promise(resolve => {
              const checkForPort = (data: string) => {
                // Check the logs for the URL being printed with the port number
                // (i.e. `http://localhost:47521`).
                if (data.indexOf(`:${devPort}`) !== -1) {
                  resolve();
                }
              };
              child.stdout.on('data', checkForPort);
              child.stderr.on('data', checkForPort);
            }),
            5 * 60 * 1000
          );
        } catch (err) {
          throw new Error(
            `Failed to detect a server running on port ${devPort}.\nDetails: https://err.sh/zeit/now-builders/now-static-build-failed-to-detect-a-server`
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
        console.log('WARN: "${devScript}" script is missing from package.json');
        console.log(
          'See the local development docs: https://zeit.co/docs/v2/deployments/official-builders/static-build-now-static-build/#local-development'
        );
      }
      const buildScript = getCommand(pkg, 'build');
      console.log(`Running "${buildScript}" script in "${entrypoint}"`);
      const found = await runPackageJsonScript(
        entrypointFsDirname,
        buildScript,
        spawnOpts
      );
      if (!found) {
        throw new Error(
          `Missing required "${buildScript}" script in "${entrypoint}"`
        );
      }
      validateDistDir(distPath, meta.isDev);
      output = await glob('**', distPath, mountpoint);
    }
    const watch = [path.join(mountpoint.replace(/^\.\/?/, ''), '**/*')];
    return { routes, watch, output };
  }

  throw new Error(
    `Build "src" is "${entrypoint}" but expected "package.json" or "build.sh"`
  );
}
