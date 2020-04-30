import ms from 'ms';
import chalk from 'chalk';
import table from 'text-table';

import Client from '../../util/client';
import getDomains from '../../util/domains/get-domains';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import strlen from '../../util/strlen';
import { Output } from '../../util/output';
import { Domain, NowContext } from '../../types';
import getCommandFlags from '../../util/get-command-flags';
import cmd from '../../util/output/cmd';

type Options = {
  '--debug': boolean;
  '--next': number;
};

export default async function ls(
  ctx: NowContext,
  opts: Options,
  args: string[],
  output: Output
) {
  const {
    authConfig: { token },
    config,
  } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const { '--debug': debug, '--next': nextTimestamp } = opts;
  const client = new Client({ apiUrl, token, currentTeam, debug });
  let contextName = null;

  if (typeof nextTimestamp !== undefined && Number.isNaN(nextTimestamp)) {
    output.error('Please provide a number for flag --next');
    return 1;
  }

  try {
    ({ contextName } = await getScope(client));
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  const lsStamp = stamp();

  if (args.length !== 0) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan('`now domains ls`')}`
    );
    return 1;
  }

  const { domains, pagination } = await getDomains(
    client,
    contextName,
    nextTimestamp
  );
  output.log(
    `Domains found under ${chalk.bold(contextName)} ${chalk.gray(lsStamp())}\n`
  );
  if (domains.length > 0) {
    console.log(`${formatDomainsTable(domains)}\n`);
  }

  if (pagination && pagination.count === 20) {
    const flags = getCommandFlags(opts, ['_', '--next']);
    output.log(
      `To display the next page run ${cmd(
        `now domains ls${flags} --next ${pagination.next}`
      )}`
    );
  }

  return 0;
}

function formatDomainsTable(domains: Domain[]) {
  const current = new Date();
  return table(
    [
      [
        '',
        chalk.gray('domain'),
        chalk.gray('serviceType'),
        chalk.gray('verified'),
        chalk.gray('cdn'),
        chalk.gray('age'),
      ].map(s => chalk.dim(s)),
      ...domains.map(domain => {
        const url = chalk.bold(domain.name);
        const time = chalk.gray(ms(current.getTime() - domain.createdAt));
        return ['', url, domain.serviceType, domain.verified, true, time];
      }),
    ],
    {
      align: ['l', 'l', 'l', 'l', 'l'],
      hsep: ' '.repeat(4),
      stringLength: strlen,
    }
  );
}
