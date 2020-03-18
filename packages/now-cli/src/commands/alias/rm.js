import chalk from 'chalk';
import ms from 'ms';
import table from 'text-table';
import Now from '../../util';
import cmd from '../../util/output/cmd.ts';
import Client from '../../util/client.ts';
import getScope from '../../util/get-scope.ts';
import removeAliasById from '../../util/alias/remove-alias-by-id';
import stamp from '../../util/output/stamp.ts';
import strlen from '../../util/strlen.ts';
import promptBool from '../../util/prompt-bool';
import { isValidName } from '../../util/is-valid-name';
import findAliasByAliasOrId from '../../util/alias/find-alias-by-alias-or-id';

export default async function rm(ctx, opts, args, output) {
  const {
    authConfig: { token },
    config,
  } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const { '--debug': debugEnabled } = opts;
  const client = new Client({
    apiUrl,
    token,
    currentTeam,
    debug: debugEnabled,
  });
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

  // $FlowFixMe
  const now = new Now({ apiUrl, token, debug: debugEnabled, currentTeam });
  const [aliasOrId] = args;

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        '`now alias rm <alias>`'
      )}`
    );
    return 1;
  }

  if (!aliasOrId) {
    output.error(`${cmd('now alias rm <alias>')} expects one argument`);
    return 1;
  }

  // E.g. "/" would not be a valid alias or id
  if (!isValidName(aliasOrId)) {
    output.error(`The provided argument "${aliasOrId}" is not a valid alias`);
    return 1;
  }

  const alias = await findAliasByAliasOrId(output, now, aliasOrId);
  if (!alias) {
    output.error(
      `Alias not found by "${aliasOrId}" under ${chalk.bold(contextName)}`
    );
    output.log(`Run ${cmd('now alias ls')} to see your aliases.`);
    return 1;
  }

  const removeStamp = stamp();
  if (!opts['--yes'] && !(await confirmAliasRemove(output, alias))) {
    output.log('Aborted');
    return 0;
  }

  await removeAliasById(now, alias.uid);
  console.log(
    `${chalk.cyan('> Success!')} Alias ${chalk.bold(
      alias.alias
    )} removed ${removeStamp()}`
  );
  return 0;
}

async function confirmAliasRemove(output, alias) {
  const srcUrl = alias.deployment
    ? chalk.underline(alias.deployment.url)
    : null;
  const tbl = table(
    [
      [
        ...(srcUrl ? [srcUrl] : []),
        chalk.underline(alias.alias),
        chalk.gray(`${ms(new Date() - new Date(alias.created))} ago`),
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
  return promptBool(output, chalk.red('Are you sure?'));
}
