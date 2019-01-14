const assert = require('assert');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

const prod = process.env.AWS_EXECUTION_ENV
  || process.env.X_GOOGLE_CODE_LOCATION;

function spawnAsync(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', cwd });
    child.on('error', reject);
    child.on('close', (code, signal) => (code !== 0
      ? reject(new Error(`Exited with ${code || signal}`))
      : resolve()));
  });
}

async function runShellScript(fsPath) {
  assert(path.isAbsolute(fsPath));
  const destPath = path.dirname(fsPath);
  await spawnAsync(`./${path.basename(fsPath)}`, [], destPath);
  return true;
}

async function scanParentDirs(destPath, scriptName) {
  assert(path.isAbsolute(destPath));

  let hasScript = false;
  let hasPackageLockJson = false;
  let currentDestPath = destPath;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const packageJsonPath = path.join(currentDestPath, 'package.json');
    // eslint-disable-next-line no-await-in-loop
    if (await fs.exists(packageJsonPath)) {
      // eslint-disable-next-line no-await-in-loop
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath));
      hasScript = Boolean(
        packageJson.scripts && scriptName && packageJson.scripts[scriptName],
      );
      // eslint-disable-next-line no-await-in-loop
      hasPackageLockJson = await fs.exists(
        path.join(currentDestPath, 'package-lock.json'),
      );
      break;
    }

    const newDestPath = path.dirname(currentDestPath);
    if (currentDestPath === newDestPath) break;
    currentDestPath = newDestPath;
  }

  return { hasScript, hasPackageLockJson };
}

async function installDependencies(destPath, args = []) {
  assert(path.isAbsolute(destPath));

  let commandArgs = args;
  console.log(`installing to ${destPath}`);
  const { hasPackageLockJson } = await scanParentDirs(destPath);

  if (hasPackageLockJson) {
    commandArgs = args.filter(a => a !== '--prefer-offline');
    await spawnAsync('npm', ['install'].concat(commandArgs), destPath);
    await spawnAsync('npm', ['cache', 'clean', '--force'], destPath);
  } else if (prod) {
    console.log('using memory-fs for yarn cache');
    await spawnAsync(
      'node',
      [path.join(__dirname, 'bootstrap-yarn.js'), '--cwd', destPath].concat(
        commandArgs,
      ),
      destPath,
    );
  } else {
    await spawnAsync('yarn', ['--cwd', destPath].concat(commandArgs), destPath);
    await spawnAsync('yarn', ['cache', 'clean'], destPath);
  }
}

async function runPackageJsonScript(destPath, scriptName) {
  assert(path.isAbsolute(destPath));
  const { hasScript, hasPackageLockJson } = await scanParentDirs(
    destPath,
    scriptName,
  );
  if (!hasScript) return false;

  if (hasPackageLockJson) {
    console.log(`running "npm run ${scriptName}"`);
    await spawnAsync('npm', ['run', scriptName], destPath);
  } else {
    console.log(`running "yarn run ${scriptName}"`);
    await spawnAsync('yarn', ['--cwd', destPath, 'run', scriptName], destPath);
  }

  return true;
}

module.exports = {
  runShellScript,
  installDependencies,
  runNpmInstall: installDependencies,
  runPackageJsonScript,
};
