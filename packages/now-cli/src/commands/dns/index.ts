import chalk from 'chalk';

import { NowContext } from '../../types';
import createOutput from '../../util/output';
import getArgs from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import handleError from '../../util/handle-error';
import logo from '../../util/output/logo';

import add from './add';
import importZone from './import';
import ls from './ls';
import rm from './rm';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now dns`)} [options] <command>

  ${chalk.dim('Commands:')}

    add     [details]             Add a new DNS entry (see below for examples)
    import  [domain] [zonefile]   Import a DNS zone file (see below for examples)
    rm      [id]                  Remove a DNS entry using its ID
    ls      [domain]              List all DNS entries for a domain

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`now.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.now`'} directory
    -d, --debug                    Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    -S, --scope                    Set a custom scope
    -N, --next                     Show next page of results

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Add an A record for a subdomain

      ${chalk.cyan(
        '$ now dns add <DOMAIN> <SUBDOMAIN> <A | AAAA | ALIAS | CNAME | TXT>  <VALUE>'
      )}
      ${chalk.cyan('$ now dns add zeit.rocks api A 198.51.100.100')}

  ${chalk.gray('–')} Add an MX record (@ as a name refers to the domain)

      ${chalk.cyan(`$ now dns add <DOMAIN> '@' MX <RECORD VALUE> <PRIORITY>`)}
      ${chalk.cyan(`$ now dns add zeit.rocks '@' MX mail.zeit.rocks 10`)}

  ${chalk.gray('–')} Add an SRV record

      ${chalk.cyan(
        '$ now dns add <DOMAIN> <NAME> SRV <PRIORITY> <WEIGHT> <PORT> <TARGET>'
      )}
      ${chalk.cyan(`$ now dns add zeit.rocks '@' SRV 10 0 389 zeit.party`)}

  ${chalk.gray('–')} Add a CAA record

      ${chalk.cyan(
        `$ now dns add <DOMAIN> <NAME> CAA '<FLAGS> <TAG> "<VALUE>"'`
      )}
      ${chalk.cyan(`$ now dns add zeit.rocks '@' CAA '0 issue "example.com"'`)}

  ${chalk.gray('–')} Import a Zone file

      ${chalk.cyan('$ now dns import <DOMAIN> <FILE>')}
      ${chalk.cyan(`$ now dns import zeit.rocks ./zonefile.txt`)}

  ${chalk.gray('–')} Paginate results, where ${chalk.dim(
    '`1584722256178`'
  )} is the time in milliseconds since the UNIX epoch.

      ${chalk.cyan(`$ now dns ls --next 1584722256178`)}
      ${chalk.cyan(`$ now dns ls zeit.rocks --next 1584722256178`)}

`);
};

const COMMAND_CONFIG = {
  add: ['add'],
  import: ['import'],
  ls: ['ls', 'list'],
  rm: ['rm', 'remove'],
};

export default async function main(ctx: NowContext) {
  let argv;

  try {
    argv = getArgs(ctx.argv.slice(2), { '--next': Number, '-N': '--next' });
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  const output = createOutput({ debug: argv['--debug'] });
  const { subcommand, args } = getSubcommand(argv._.slice(1), COMMAND_CONFIG);
  switch (subcommand) {
    case 'add':
      return add(ctx, argv, args, output);
    case 'import':
      return importZone(ctx, argv, args, output);
    case 'rm':
      return rm(ctx, argv, args, output);
    default:
      return ls(ctx, argv, args, output);
  }
}
