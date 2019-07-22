import chalk from 'chalk';
import { Stats } from 'fs';
import { dirname, join, resolve } from 'path';
import { readJSON, lstat, readlink } from 'fs-extra';

import cmd from '../util/output/cmd';
import logo from '../util/output/logo';
import handleError from '../util/handle-error';
import getArgs from '../util/get-args';
import { NowContext } from '../types';
import createOutput from '../util/output';
import { version } from '../../package.json';

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

// `npm` tacks a bunch of extra properties on the `package.json` file,
// so check for one of them to determine yarn vs. npm.
async function isYarn(): Promise<boolean> {
  let s: Stats;
  let binPath = process.argv[1];
  while (true) {
    s = await lstat(binPath);
    if (s.isSymbolicLink()) {
      binPath = resolve(dirname(binPath), await readlink(binPath));
    } else {
      break;
    }
  }
  const pkgPath = join(dirname(binPath), '..', 'package.json');
  const pkg = await readJSON(pkgPath);
  return !('_id' in pkg);
}

export async function getUpgradeCommand(): Promise<string> {
  const tag = version.includes('canary') ? 'canary' : 'latest';
  return (await isYarn())
    ? `Please run ${cmd(`yarn global add now@${tag}`)} to update Now CLI.`
    : `Please run ${cmd(`npm install -g now@${tag}`)} to update Now CLI.`;
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

  if (argv['--help']) {
    help();
    return 2;
  }

  const debugEnabled = argv['--debug'];
  const output = createOutput({ debug: debugEnabled });
  output.log(await getUpgradeCommand());
  return 0;
}
