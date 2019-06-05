import chalk from 'chalk';
import { tmpdir } from 'os';
import pipe from 'promisepipe';
import fetch from 'node-fetch';
import Progress from 'progress';
import { createGunzip } from 'zlib';
import { parse, format } from 'url';
import { basename, join } from 'path';
import { spawnSync } from 'child_process';
import {
  createReadStream,
  createWriteStream,
  chmod,
  chown,
  copyFile,
  move,
  remove,
  stat
} from 'fs-extra';

import pkg from '../util/pkg';
import logo from '../util/output/logo';
import promptBool from '../util/prompt-bool';
import handleError from '../util/handle-error';
import getArgs from '../util/get-args';
import { NowContext } from '../types';
import createOutput, { Output } from '../util/output';

const versionEndpoint = 'https://install-now-cli.zeit.sh/version';

const platformMap: Map<string, string> = new Map([
  ['darwin', 'macos'],
  ['linux', 'linux'],
  ['win32', 'win']
]);

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now update`)} [options]

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -d, --debug                    Debug mode [off]
    -c ${chalk.bold.underline('NAME')}, --channel=${chalk.bold.underline(
    'NAME'
  )}        Specify which release channel to install [stable]
    -r ${chalk.bold.underline('VERSION')}, --release=${chalk.bold.underline(
    'VERSION'
  )}  Specfic version to install (overrides \`--channel\`)
    -y, --yes                      Skip the confirmation prompt

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Update Now CLI to the latest "canary" version

      ${chalk.cyan(`$ now update --channel=canary`)}
  `);
};

function detectAlpine() {
  // https://github.com/sass/node-sass/issues/1589#issuecomment-265292579
  const ldd = spawnSync('ldd', [process.execPath]).stdout.toString();
  return /\bmusl\b/.test(ldd);
}

function getDefaultChannel(): string {
  const m = pkg.version.match(/-(.+)\./);
  return m ? m[1] : 'stable';
}

function getPlatform(nodePlatform: string): string {
  let platform = platformMap.get(nodePlatform);
  if (!platform) {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  if (platform === 'linux' && detectAlpine()) {
    platform = 'alpine';
  }
  return platform;
}

function getReleaseUrl(version: string, platform: string): string {
  const ext = platform === 'win' ? '.exe' : '';
  return `https://github.com/zeit/now-cli/releases/download/${version}/now-${platform}${ext}.gz`;
}

function isNpmInstall(binaryPath: string): boolean {
  return binaryPath.includes('node_modules');
}

async function getLatestVersion(
  { debug }: Output,
  channel: string
): Promise<string> {
  const parsed = parse(versionEndpoint, true);
  parsed.query.channel = channel;
  const url = format(parsed);
  debug(`GET ${url}`);
  const res = await fetch(url);
  const body = await res.text();
  debug(`Resolved latest version "${body}" from channel "${channel}"`);
  return body.trim();
}

async function downloadNowCli({ debug, print }: Output, url: string, dest: string) {
  debug(`GET ${url}`);
  debug(`Downloading to path: ${dest}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Got ${res.status} status code while downloading Now CLI`);
  }
  const total = parseInt(res.headers.get('content-length') || '0', 10);
  const bar = new Progress(':bar :percent', {
    complete: '#',
    incomplete: ' ',
    width: 80,
    clear: true,
    total
  });
  const pipePromise = pipe(
    res.body,
    createGunzip(),
    createWriteStream(dest)
  );
  res.body.on('data', (buf: Buffer) => {
    bar.tick(buf.length);
  });
  await pipePromise;
}

async function updateNowCli(src: string, dest: string): Promise<number> {
  await pipe(
    createReadStream(src),
    createWriteStream(dest)
  );
  return 0;
}

async function removeAndMove({ debug, error }: Output, src: string, dest: string): Promise<number> {
  try {
    const { mode, uid, gid } = await stat(dest);
    await remove(dest);
    await move(src, dest);
    const afterStat = await stat(dest);
    if (mode !== afterStat.mode) {
      debug(`Updating mode to "o${mode.toString(8)}"`);
      await chmod(dest, mode);
    }
    if (uid !== afterStat.uid || gid !== afterStat.gid) {
      debug(`Updating ownership to "${uid}:${gid}"`);
      await chown(dest, uid, gid);
    }
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'EPERM' || nodeErr.code === 'EACCES') {
      error(`Permission denied to modify file "${dest}". Please run again using \`sudo\`.`);
      return 1;
    }
    throw err;
  }
  return 0;
}

export default async function main(ctx: NowContext): Promise<number> {
  let argv;

  try {
    argv = getArgs(ctx.argv.slice(2), {
      '--channel': String,
      '-c': '--channel',
      '--release': String,
      '-V': '--release',
      '--yes': Boolean,
      '-y': '--yes'
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  const skipConfirmation: boolean = argv['--yes'] || false;

  if (argv['--help']) {
    help();
    return 2;
  }

  let explicitVersion = false;
  let version: string = argv['--release'];
  const location = process.execPath;
  const { updateChannel = '' } = ctx.config || {};
  const debugEnabled = argv['--debug'];
  const channel: string = argv['--channel'] || updateChannel || getDefaultChannel();
  const output = createOutput({ debug: debugEnabled });
  const { log, note, success, print, debug } = output;

  output.dim(`Now CLI ${pkg.version} update (beta) — https://zeit.co/feedback/update`);

  // Don't update if executing with `node` (i.e. during development)
  if (!basename(location).startsWith('now')) {
    note(`Refusing to update file "${location}" because it does not appear to be a \`now\` binary`);
    return 1;
  }

  log('Updating Now CLI...');

  if (version) {
    explicitVersion = true;
  } else {
    version = await getLatestVersion(output, channel);
  }

  if (version === pkg.version) {
    note(`Now CLI is already the latest version (${chalk.green(version)})`);
    return 0;
  }

  const platform = getPlatform(process.platform);
  const url = getReleaseUrl(version, platform);

  const config: { [name: string]: string } = {
    platform,
    arch: 'x64',
    location,
    version
  };

  if (!explicitVersion) {
    config.version += ` (latest ${chalk.green(channel)} release)`;
  }

  print(`\n  ${chalk.bold('Configuration')}\n\n`);
  for (const name of Object.keys(config)) {
    print(`    ${chalk.cyan(name)}\t${config[name]}\n`);
  }

  print('\n');
  log('Downloading `now` binary...');
  log(`Binary URL: ${chalk.underline.blue(url)}`);

  const confirmed = skipConfirmation || await promptBool(output, 'Update Now CLI?');
  if (!confirmed) {
    log('Aborting');
    return 0;
  }

  const tmpBin: string = join(tmpdir(), `now-${Math.random().toString(32).slice(-10)}`);
  let rtn = 0;
  try {
    await downloadNowCli(output, url, tmpBin);
    rtn = await updateNowCli(tmpBin, location);
  } catch(err) {
    if (err.message.startsWith('ETXTBSY')) {
      debug(`Got "ETXTBSY" error - falling back to unlink + rename method`);
      rtn = await removeAndMove(output, tmpBin, location);
    } else {
      throw err;
    }
  } finally {
    await remove(tmpBin);
  }

  if (rtn === 0) {
    success(`Updated Now CLI to ${chalk.green(version)}`);
  }
  return rtn;
}
