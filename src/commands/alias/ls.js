// @flow
import chalk from 'chalk';
import ms from 'ms';
import plural from 'pluralize';
import table from 'text-table';

import Now from '../../util';
import { CLIContext, Output } from '../../util/types';
import getAliases from '../../util/alias/get-aliases';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import strlen from '../../util/strlen';
import wait from '../../util/output/wait';
import type { CLIAliasOptions, Alias, PathAliasRule } from '../../util/types';

export default async function ls(
  ctx: CLIContext,
  opts: CLIAliasOptions,
  args: string[],
  output: Output
): Promise<number> {
  const { authConfig: { token }, config } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const { ['--debug']: debugEnabled } = opts;
  const { contextName } = await getScope({
    apiUrl,
    token,
    debug: debugEnabled,
    currentTeam
  });

  // $FlowFixMe
  const now = new Now({ apiUrl, token, debug: debugEnabled, currentTeam });
  const lsStamp = stamp();
  let cancelWait;

  if (args.length > 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        '`now alias ls [alias]`'
      )}`
    );
    return 1;
  }

  if (!opts['--json']) {
    cancelWait = wait(
      args[0]
        ? `Fetching alias details for "${args[0]}" under ${chalk.bold(
            contextName
          )}`
        : `Fetching aliases under ${chalk.bold(contextName)}`
    );
  }

  const aliases: Alias[] = await getAliases(now);
  if (cancelWait) cancelWait();

  if (args[0]) {
    const alias = aliases.find(
      item => item.uid === args[0] || item.alias === args[0]
    );
    if (!alias) {
      output.error(`Could not match path alias for: ${args[0]}`);
      now.close();
      return 1;
    }

    if (opts['--json']) {
      output.print(JSON.stringify({ rules: alias.rules }, null, 2));
    } else {
      const rules: PathAliasRule[] = alias.rules || [];
      output.log(
        `${rules.length} path alias ${plural(
          'rule',
          rules.length
        )} found under ${chalk.bold(contextName)} ${lsStamp()}`
      );
      output.print(`${printPathAliasTable(rules)}\n`);
    }
  } else {
    aliases.sort((a, b) => new Date(b.created) - new Date(a.created));
    output.log(
      `${plural('alias', aliases.length, true)} found under ${chalk.bold(
        contextName
      )} ${lsStamp()}`
    );
    console.log(printAliasTable(aliases));
  }

  now.close();
  return 0;
}

function printAliasTable(aliases: Alias[]): string {
  return (
    table(
      [
        ['source', 'url', 'age'].map(h => chalk.gray(h)),
        ...aliases.map(a => [
          a.rules && a.rules.length
            ? chalk.cyan(`[${plural('rule', a.rules.length, true)}]`)
            : // for legacy reasons, we might have situations
              // where the deployment was deleted and the alias
              // not collected appropriately, and we need to handle it
              a.deployment && a.deployment.url
              ? a.deployment.url
              : chalk.gray('–'),
          a.alias,
          ms(Date.now() - new Date(a.created))
        ])
      ],
      {
        align: ['l', 'l', 'r'],
        hsep: ' '.repeat(4),
        stringLength: strlen
      }
    ).replace(/^/gm, '  ') + '\n\n'
  );
}

function printPathAliasTable(rules: PathAliasRule[]): string {
  const header = [['pathname', 'method', 'dest'].map(s => chalk.gray(s))];
  return (
    table(
      header.concat(
        rules.map(rule => {
          return [
            rule.pathname ? rule.pathname : chalk.cyan('[fallthrough]'),
            rule.method ? rule.method : '*',
            rule.dest
          ];
        })
      ),
      {
        align: ['l', 'l', 'l', 'l'],
        hsep: ' '.repeat(6),
        stringLength: strlen
      }
    ).replace(/^(.*)/gm, '  $1') + '\n'
  );
}
