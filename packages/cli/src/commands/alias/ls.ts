import chalk from 'chalk';
import ms from 'ms';
import table from 'text-table';
import Client from '../../util/client';
import getAliases from '../../util/alias/get-aliases';
import getScope from '../../util/get-scope';
import {
  PaginationOptions,
  getPaginationOpts,
} from '../../util/get-pagination-opts';
import stamp from '../../util/output/stamp';
import strlen from '../../util/strlen';
import getCommandFlags from '../../util/get-command-flags';
import { getCommandName } from '../../util/pkg-name';
import type { Alias } from '@vercel-internals/types';

export default async function ls(
  client: Client,
  opts: PaginationOptions,
  args: string[]
) {
  const { output } = client;
  const { contextName } = await getScope(client);

  let paginationOptions;

  try {
    paginationOptions = getPaginationOpts(opts);
  } catch (err: unknown) {
    output.prettyError(err);
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
    ...paginationOptions
  );
  output.log(`aliases found under ${chalk.bold(contextName)} ${lsStamp()}`);
  client.stdout.write(printAliasTable(aliases));

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
