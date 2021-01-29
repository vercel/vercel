import chalk from 'chalk';
import ms from 'ms';
import table from 'text-table';
import Now from '../../util';
import Client from '../../util/client.ts';
import getAliases from '../../util/alias/get-aliases';
import getScope from '../../util/get-scope.ts';
import stamp from '../../util/output/stamp.ts';
import strlen from '../../util/strlen.ts';
import getCommandFlags from '../../util/get-command-flags';
import { getCommandName } from '../../util/pkg-name.ts';

export default async function ls(ctx, opts, args) {
  const {
    authConfig: { token },
    output,
    config,
  } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const { '--debug': debugEnabled, '--next': nextTimestamp } = opts;
  const client = new Client({
    apiUrl,
    token,
    currentTeam,
    debug: debugEnabled,
    output,
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

  if (typeof nextTimestamp !== undefined && Number.isNaN(nextTimestamp)) {
    output.error('Please provide a number for flag --next');
    return 1;
  }

  const now = new Now({
    apiUrl,
    token,
    debug: debugEnabled,
    currentTeam,
    output,
  });
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

  const { aliases, pagination } = await getAliases(
    now,
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

  now.close();
  return 0;
}

function printAliasTable(aliases) {
  return `${table(
    [
      ['source', 'url', 'age'].map(h => chalk.gray(h)),
      ...aliases.map(a => [
        // for legacy reasons, we might have situations
        // where the deployment was deleted and the alias
        // not collected appropriately, and we need to handle it
        a.deployment && a.deployment.url ? a.deployment.url : chalk.gray('–'),
        a.alias,
        ms(Date.now() - new Date(a.createdAt)),
      ]),
    ],
    {
      align: ['l', 'l', 'r'],
      hsep: ' '.repeat(4),
      stringLength: strlen,
    }
  ).replace(/^/gm, '  ')}\n\n`;
}
