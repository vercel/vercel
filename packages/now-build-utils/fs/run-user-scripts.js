const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

function spawnAsync(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', cwd });
    child.on('error', reject);
    child.on('close', (code, signal) => (code !== 0 ? reject(new Error(`Exited with ${code || signal}`)) : resolve()));
  });
}

async function runShellScript(fsPath) {
  const destPath = path.dirname(fsPath);
  await spawnAsync(`./${path.basename(fsPath)}`, [], destPath);
  return true;
}

async function shouldUseNpm(destPath) {
  let currentDestPath = destPath;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    if (await fs.exists(path.join(currentDestPath, 'package.json'))) {
      // eslint-disable-next-line no-await-in-loop
      if (await fs.exists(path.join(currentDestPath, 'package-lock.json'))) {
        return true;
      }
      return false;
    }

    const newDestPath = path.dirname(currentDestPath);
    if (currentDestPath === newDestPath) break;
    currentDestPath = newDestPath;
  }

  return false;
}

async function runNpmInstall(destPath, args = []) {
  let commandArgs = args;
  console.log(`installing to ${destPath}`);
  if (await shouldUseNpm(destPath)) {
    commandArgs = args.filter(a => a !== '--prefer-offline');
    await spawnAsync('npm', ['install'].concat(commandArgs), destPath);
  } else {
    await spawnAsync('yarn', ['--cwd', destPath].concat(commandArgs), destPath);
  }
}

async function runPackageJsonScript(destPath, scriptName) {
  try {
    if (await shouldUseNpm(destPath)) {
      console.log(`running "npm run ${scriptName}"`);
      await spawnAsync('npm', ['run', scriptName], destPath);
    } else {
      console.log(`running "yarn run ${scriptName}"`);
      await spawnAsync('yarn', ['--cwd', destPath, 'run', scriptName], destPath);
    }
  } catch (error) {
    console.log(error.message);
    return false;
  }

  return true;
}

module.exports = {
  runShellScript,
  runNpmInstall,
  runPackageJsonScript,
};
