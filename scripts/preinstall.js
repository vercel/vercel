#!/usr/bin/env node
const { join } = require('path');
const { promisify } = require('util');
const { existsSync, stat: _stat, unlink: _unlink } = require('fs');

const stat = promisify(_stat);
const unlink = promisify(_unlink);

function cmd(command) {
  return `\`${command}\``;
}

function error(command) {
  console.error('> Error!', command);
};

function debug(str) {
  if (process.argv.find((str) => str === '--debug')) {
    console.log(`[debug] [${new Date().toISOString()}]`, str);
  }
}

// Logic is from Now Desktop
// See: https://git.io/fj4jD
async function getNowPath() {
  if (process.platform === 'win32') {
    const path = `${process.env.LOCALAPPDATA}\\now-cli\\now.exe`;
    return existsSync(path) ? path : null;
  }

  const pathEnv = (process.env.PATH || '').split(':');

  const paths = [
    join(process.env.HOME || '/', 'bin'),
    '/usr/local/bin',
    '/usr/bin'
  ];

  for (const basePath of paths) {
    if (!pathEnv.includes(basePath)) {
      continue;
    }

    const nowPath = join(basePath, 'now');

    if (existsSync(nowPath)) {
      return nowPath;
    }
  }

  return null;
}

async function isBinary(nowPath) {
  const stats = await stat(nowPath);
  return !stats.isDirectory();
}

async function main() {
  const nowPath = await getNowPath();

  if (nowPath === null) {
    debug(`No now binary found`);
    return;
  }

  try {
    if ((await isBinary(nowPath)) === false) {
      debug(
        'Found file or directory named now but will not delete, ' +
        'as it seems unrelated to Now CLI'
      );
      return;
    }

    await unlink(nowPath);

    debug(`Removed ${nowPath}`);
  } catch (err) {
    if (process.platform !== 'win32') {
      error(
        `An error occured while removing the previous Now CLI installation.\n` +
        `Please use the this command to remove it: ${cmd(`sudo rm ${nowPath}`)}.\n` +
        `Then try to install it again.`
      );
    } else {
      error(
        `An error occured while removing the previous Now CLI installation.\n` +
        `Please remove ${cmd(nowPath)} manually and try to install it again.`
      );
    }

    process.exit(1);
  }
}

main()
  .then(() => process.exit(0));
