import chalk from 'chalk';
import ms from 'ms';
import table from 'text-table';
import Client from '../../util/client';
import getAliases from '../../util/alias/get-aliases';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import strlen from '../../util/strlen';
import getCommandFlags from '../../util/get-command-flags';
import { getCommandName } from '../../util/pkg-name';

import { Alias } from '../../types';

interface Options {
  '--next'?: number;
}

export default async function ls(
  client: Client,
  opts: Options,
  args: string[]
) {
  const { output } = client;
  const { '--next': nextTimestamp } = opts;
  const { contextName } = await getScope(client);

  if (typeof nextTimestamp !== undefined && Number.isNaN(nextTimestamp)) {
    output.error('Please provide a number for flag --next');
    return 1;
  }

  const lsStamp = stamp();

  if (args.length > 0) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('alias ls')}`
      )}`
    );
    return 1;
  }

  output.spinner(`Fetching aliases under ${chalk.bold(contextName)}`);

  // Get the list of alias
  const { aliases, pagination } = await getAliases(
    client,
    undefined,
    nextTimestamp
  );
  output.log(`aliases found under ${chalk.bold(contextName)} ${lsStamp()}`);
  console.log(printAliasTable(aliases));

  if (pagination && pagination.count === 20) {
    const flags = getCommandFlags(opts, ['_', '--next']);
    output.log(
      `To display the next page run ${getCommandName(
        `alias ls${flags} --next ${pagination.next}`
      )}`
    );
  }

  return 0;
}

function printAliasTable(aliases: Alias[]) {
  return `${table(
    [
      ['source', 'url', 'age'].map(header => chalk.gray(header)),
      ...aliases.map(a => [
        // for legacy reasons, we might have situations
        // where the deployment was deleted and the alias
        // not collected appropriately, and we need to handle it
        a.deployment && a.deployment.url ? a.deployment.url : chalk.gray('–'),
        a.alias,
        ms(Date.now() - a.createdAt),
      ]),
    ],
    {
      align: ['l', 'l', 'r'],
      hsep: ' '.repeat(4),
      stringLength: strlen,
    }
  ).replace(/^/gm, '  ')}\n\n`;
}
