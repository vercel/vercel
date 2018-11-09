const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

async function runShellScript (fsPath) {
  const destPath = path.dirname(fsPath);
  await spawnAsync('./' + path.basename(fsPath), [], destPath);
  return true;
}

async function shouldUseNpm (destPath) {
  while (true) {
    if (await fs.exists(path.join(destPath, 'package.json'))) {
      if (await fs.exists(path.join(destPath, 'package-lock.json'))) {
        return true;
      } else {
        return false;
      }
    }

    const newDestPath = path.dirname(destPath);
    if (destPath === newDestPath) break;
    destPath = newDestPath;
  }

  return false;
}

async function runNpmInstall (destPath, args = []) {
  console.log(`installing to ${destPath}`);
  if (await shouldUseNpm(destPath)) {
    args = args.filter((a) => a !== '--prefer-offline');
    await spawnAsync('npm', [ 'install' ].concat(args), destPath);
  } else {
    await spawnAsync('yarn', [ '--cwd', destPath ].concat(args), destPath);
  }
}

async function runPackageJsonScript (destPath, scriptName) {
  try {
    if (await shouldUseNpm(destPath)) {
      console.log(`running "npm run ${scriptName}"`);
      await spawnAsync('npm', [ 'run', scriptName ], destPath);
    } else {
      console.log(`running "yarn run ${scriptName}"`);
      await spawnAsync('yarn', [ '--cwd', destPath, 'run', scriptName ], destPath);
    }
  } catch (error) {
    console.log(error.message);
    return false;
  }

  return true;
}

function spawnAsync (command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', cwd });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code !== 0) return reject(new Error(`Exited with ${code || signal}`));
      resolve();
    });
  });
}

module.exports = {
  runShellScript,
  runNpmInstall,
  runPackageJsonScript
};
