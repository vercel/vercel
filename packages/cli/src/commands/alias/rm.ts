import chalk from 'chalk';
import ms from 'ms';
import table from '../../util/output/table';
import Client from '../../util/client';
import getScope from '../../util/get-scope';
import removeAliasById from '../../util/alias/remove-alias-by-id';
import stamp from '../../util/output/stamp';
import confirm from '../../util/input/confirm';
import findAliasByAliasOrId from '../../util/alias/find-alias-by-alias-or-id';

import type { Alias } from '@vercel-internals/types';
import { isValidName } from '../../util/is-valid-name';
import { getCommandName } from '../../util/pkg-name';

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
  output.success(`Alias ${chalk.bold(alias.alias)} removed ${removeStamp()}`);
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
    { hsep: 4 }
  );

  client.output.log(`The following alias will be removed permanently`);
  client.output.print(`  ${tbl}\n`);
  return confirm(client, chalk.red('Are you sure?'), false);
}
