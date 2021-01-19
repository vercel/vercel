import chalk from 'chalk';

import cmd from '../util/output/cmd';
import logo from '../util/output/logo';
import handleError from '../util/handle-error';
import getArgs from '../util/get-args';
import { NowContext } from '../types';
import getUpdateCommand from '../util/get-update-command';
import { getPkgName, getTitleName } from '../util/pkg-name';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} update`)} [options]

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

  ${chalk.gray('–')} Update ${getTitleName()} CLI to the latest "canary" version

      ${chalk.cyan(`$ ${getPkgName()} update --channel=canary`)}
  `);
};

export default async function main(ctx: NowContext): Promise<number> {
  let argv;
  const { output } = ctx;

  try {
    argv = getArgs(ctx.argv.slice(2), {
      '--channel': String,
      '-c': '--channel',
      '--release': String,
      '-V': '--release',
      '--yes': Boolean,
      '-y': '--yes',
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  output.log(
    `Please run ${cmd(
      await getUpdateCommand()
    )} to update ${getTitleName()} CLI`
  );
  return 0;
}
