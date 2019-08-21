#!/usr/bin/env node
const fs = require('fs');
const { promisify } = require('util');
const { join, delimiter } = require('path');

const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);

function cmd(command) {
  return `\`${command}\``;
}

function error(command) {
  console.error('> Error!', command);
}

function debug(str) {
  if (
    process.argv.find(str => str === '--debug') ||
    process.env.PREINSTALL_DEBUG
  ) {
    console.log(`[debug] [${new Date().toISOString()}]`, str);
  }
}

function isYarn() {
  return process.env.npm_config_heading !== 'npm';
}

function isGlobal() {
  const cmd = JSON.parse(process.env.npm_config_argv || '{ "original": [] }');

  return isYarn()
    ? cmd.original.includes('global')
    : Boolean(process.env.npm_config_global);
}

// Logic is from Now Desktop
// See: https://git.io/fj4jD
function getNowPath() {
  if (process.platform === 'win32') {
    const path = join(process.env.LOCALAPPDATA, 'now-cli', 'now.exe');
    return fs.existsSync(path) ? path : null;
  }

  const pathEnv = (process.env.PATH || '').split(delimiter);

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

    if (fs.existsSync(nowPath)) {
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
  if (!isGlobal()) {
    debug('Skip preinstall since now is being installed locally');
    return;
  }

  const nowPath = getNowPath();

  if (nowPath === null) {
    debug(`No now binary found`);
    return;
  }

  debug(`Located now binary at ${nowPath}`);

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
        `Could not remove your previous Now CLI installation.\n` +
          `Please use this command to remove it: ${cmd(
            `sudo rm ${nowPath}`
          )}.\n` +
          `Then try to install it again.`
      );
    } else {
      error(
        `Could not remove your previous Now CLI installation.\n` +
          `Please remove ${cmd(nowPath)} manually and try to install it again.`
      );
    }

    process.exit(1);
  }
}

process.on('unhandledRejection', err => {
  console.error('Unhandled Rejection:');
  console.error(err);
  process.exit(1);
});

process.on('uncaughtException', err => {
  console.error('Uncaught Exception:');
  console.error(err);
  process.exit(1);
});

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
