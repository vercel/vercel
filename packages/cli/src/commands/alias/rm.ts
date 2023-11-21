import chalk from 'chalk';
import ms from 'ms';
import table from 'text-table';
import Client from '../../util/client.js';
import getScope from '../../util/get-scope.js';
import removeAliasById from '../../util/alias/remove-alias-by-id.js';
import stamp from '../../util/output/stamp.js';
import strlen from '../../util/strlen.js';
import confirm from '../../util/input/confirm.js';
import findAliasByAliasOrId from '../../util/alias/find-alias-by-alias-or-id.js';

import type { Alias } from '@vercel-internals/types';
import { isValidName } from '../../util/is-valid-name.js';
import { getCommandName } from '../../util/pkg-name.js';

type Options = {
  '--yes': boolean;
};

export default async function rm(
  client: Client,
  opts: Partial<Options>,
  args: string[]
) {
  const { output } = client;
  const { contextName } = await getScope(client);

  const [aliasOrId] = args;

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('alias rm <alias>')}`
      )}`
    );
    return 1;
  }

  if (!aliasOrId) {
    output.error(`${getCommandName('alias rm <alias>')} expects one argument`);
    return 1;
  }

  // E.g. "/" would not be a valid alias or id
  if (!isValidName(aliasOrId)) {
    output.error(`The provided argument "${aliasOrId}" is not a valid alias`);
    return 1;
  }

  const alias = await findAliasByAliasOrId(output, client, aliasOrId);

  if (!alias) {
    output.error(
      `Alias not found by "${aliasOrId}" under ${chalk.bold(contextName)}`
    );
    output.log(`Run ${getCommandName('alias ls')} to see your aliases.`);
    return 1;
  }

  const removeStamp = stamp();
  if (!opts['--yes'] && !(await confirmAliasRemove(client, alias))) {
    output.log('Canceled');
    return 0;
  }

  await removeAliasById(client, alias.uid);
  console.log(
    `${chalk.cyan('> Success!')} Alias ${chalk.bold(
      alias.alias
    )} removed ${removeStamp()}`
  );
  return 0;
}

async function confirmAliasRemove(client: Client, alias: Alias) {
  const srcUrl = alias.deployment
    ? chalk.underline(alias.deployment.url)
    : null;
  const tbl = table(
    [
      [
        ...(srcUrl ? [srcUrl] : []),
        chalk.underline(alias.alias),
        chalk.gray(`${ms(Date.now() - alias.createdAt)} ago`),
      ],
    ],
    {
      align: ['l', 'l', 'r'],
      hsep: ' '.repeat(4),
      stringLength: strlen,
    }
  );

  client.output.log(`The following alias will be removed permanently`);
  client.output.print(`  ${tbl}\n`);
  return confirm(client, chalk.red('Are you sure?'), false);
}
