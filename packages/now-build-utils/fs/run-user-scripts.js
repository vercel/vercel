const assert = require('assert');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

function spawnAsync(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', cwd });
    child.on('error', reject);
    child.on('close', (code, signal) => (code !== 0
      ? reject(new Error(`Exited with ${code || signal}`))
      : resolve()));
  });
}

async function chmodPlusX(fsPath) {
  const s = await fs.stat(fsPath);
  const newMode = s.mode | 64 | 8 | 1; // eslint-disable-line no-bitwise
  if (s.mode === newMode) return;
  const base8 = newMode.toString(8).slice(-3);
  await fs.chmod(fsPath, base8);
}

async function runShellScript(fsPath) {
  assert(path.isAbsolute(fsPath));
  const destPath = path.dirname(fsPath);
  await chmodPlusX(fsPath);
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
