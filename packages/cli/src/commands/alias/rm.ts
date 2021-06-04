import chalk from 'chalk';
import ms from 'ms';
import table from 'text-table';
import Client from '../../util/client';
import getScope from '../../util/get-scope';
import removeAliasById from '../../util/alias/remove-alias-by-id';
import stamp from '../../util/output/stamp';
import strlen from '../../util/strlen';
import confirm from '../../util/input/confirm';
import findAliasByAliasOrId from '../../util/alias/find-alias-by-alias-or-id';

import { Alias } from '../../types';
import { Output } from '../../util/output';
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

  let contextName = null;

  try {
    ({ contextName } = await getScope(client));
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

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
  if (!opts['--yes'] && !(await confirmAliasRemove(output, alias))) {
    output.log('Aborted');
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

async function confirmAliasRemove(output: Output, alias: Alias) {
  const srcUrl = alias.deployment
    ? chalk.underline(alias.deployment.url)
    : null;
  const tbl = table(
    [
      [
        ...(srcUrl ? [srcUrl] : []),
        chalk.underline(alias.alias),
        chalk.gray(`${ms(Date.now() - new Date(alias.created).getTime())} ago`),
      ],
    ],
    {
      align: ['l', 'l', 'r'],
      hsep: ' '.repeat(4),
      stringLength: strlen,
    }
  );

  output.log(`The following alias will be removed permanently`);
  output.print(`  ${tbl}\n`);
  return confirm(chalk.red('Are you sure?'), false);
}
