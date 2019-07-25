import chalk from 'chalk';
import {  join } from 'path';
import { pathExists } from 'fs-extra';

import logo from '../util/output/logo';
import handleError from '../util/handle-error';
import getArgs from '../util/get-args';
import { NowContext } from '../types';
import createOutput from '../util/output';

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

export async function getUpgradeCommand() {
  const isYarn = await pathExists(join(process.cwd(), 'yarn.lock'));

  return isYarn
  ? 'Please run `yarn global upgrade now` to update Now CLI.'
  : 'Please run `npm install -g now@latest` to update Now CLI.'
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
  const { log } = output;

  log(await getUpgradeCommand());
  return 0;
}
