#!/usr/bin/env node
import { join } from 'path';
import { remove, existsSync, stat } from 'fs-extra';
import cmd from '../src/util/output/cmd';
import createOutput from '../src/util/output';

// Logic is from Now Desktop
// See: https://git.io/fj4jD
async function getNowPath(): Promise<string | null> {
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

async function isBinary(nowPath: string): Promise<boolean> {
  const stats = await stat(nowPath);

  if (stats.isDirectory()) {
    return false;
  }

  return true;
}

async function main() {
  const output = createOutput({ debug: Boolean(process.argv.find((str) => str === '--debug')) });
  const nowPath = await getNowPath();

  if (nowPath === null) {
    output.debug(`No now binary found`);
    return;
  }

  try {
    if ((await isBinary(nowPath)) === false) {
      output.debug(
        '[preinstall] Found file or directory named now but will not delete, ' +
        'as it seems unrelated to Now CLI'
      );
      return;
    }

    await remove(nowPath);

    output.debug(`Removed ${nowPath}`);
  } catch (err) {
    if (process.platform !== 'win32') {
      output.error(
        `[preinstall] An error occured while removing the previous Now CLI installation.\n` +
        `Please use the this command to remove it: ${cmd(`sudo rm ${nowPath}`)}.\n` +
        `Then try to install it again.`
      );
    } else {
      output.error(
        `[preinstall] An error occured while removing the previous Now CLI installation.\n` +
        `Please remove ${cmd(nowPath)} manually and try to install it again.`
      );
    }

    process.exit(1);
  }
}

main()
  .then(() => process.exit(0));
