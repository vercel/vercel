import chalk from 'chalk';

// @ts-ignore
import { handleError } from '../../util/error';

import getArgs from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';

import add from './add';
import issue from './issue';
import ls from './ls';
import rm from './rm';
import Client from '../../util/client';
import { packageName, logo } from '../../util/pkg-name';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${packageName} certs`)} [options] <command>

  ${chalk.yellow('NOTE:')} This command is intended for advanced use only.
  By default, Vercel manages your certificates automatically.

  ${chalk.dim('Commands:')}

    ls                        Show all available certificates
    issue      <cn> [<cn>]    Issue a new certificate for a domain
    rm         <id>           Remove a certificate by id

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory
    -d, --debug                    Debug mode [off]
    --no-color                     No color mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    -S, --scope                    Set a custom scope
    --challenge-only               Only show challenges needed to issue a cert
    --crt ${chalk.bold.underline('FILE')}                     Certificate file
    --key ${chalk.bold.underline(
      'FILE'
    )}                     Certificate key file
    --ca ${chalk.bold.underline(
      'FILE'
    )}                      CA certificate chain file
    -N, --next                     Show next page of results
    --limit=${chalk.bold.underline(
      'VALUE'
    )}                  Number of results to return per page (default: 20, max: 100)

  ${chalk.dim('Examples:')}

  ${chalk.gray(
    '–'
  )} Generate a certificate with the cnames "acme.com" and "www.acme.com"

      ${chalk.cyan(`$ ${packageName} certs issue acme.com www.acme.com`)}

  ${chalk.gray('–')} Remove a certificate

      ${chalk.cyan(`$ ${packageName} certs rm id`)}

  ${chalk.gray('–')} Paginate results, where ${chalk.dim(
    '`1584722256178`'
  )} is the time in milliseconds since the UNIX epoch.

      ${chalk.cyan(`$ ${packageName} certs ls --next 1584722256178`)}
  `);
};

const COMMAND_CONFIG = {
  add: ['add'],
  issue: ['issue'],
  ls: ['ls', 'list'],
  renew: ['renew'],
  rm: ['rm', 'remove'],
};

export default async function main(client: Client) {
  let argv;

  try {
    argv = getArgs(client.argv.slice(2), {
      '--challenge-only': Boolean,
      '--overwrite': Boolean,
      '--output': String,
      '--crt': String,
      '--key': String,
      '--ca': String,
      '--next': Number,
      '-N': '--next',
      '--limit': Number,
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  const { output } = client;
  const { subcommand, args } = getSubcommand(argv._.slice(1), COMMAND_CONFIG);
  switch (subcommand) {
    case 'issue':
      return issue(client, argv, args);
    case 'ls':
      return ls(client, argv, args);
    case 'rm':
      return rm(client, argv, args);
    case 'add':
      return add(client, argv, args);
    case 'renew':
      output.error('Renewing certificates is deprecated, issue a new one.');
      return 1;
    default:
      output.error('Please specify a valid subcommand: ls | issue | rm');
      help();
      return 2;
  }
}
