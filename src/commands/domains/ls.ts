import ms from 'ms';
import chalk from 'chalk';
import plural from 'pluralize';
import table from 'text-table';

import Client from '../../util/client';
import getDomains from '../../util/domains/get-domains';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import strlen from '../../util/strlen';
import { Output } from '../../util/output';
import { Domain, NowContext } from '../../types';

type Options = {
  '--debug': boolean;
};

export default async function ls(
  ctx: NowContext,
  opts: Options,
  args: string[],
  output: Output
) {
  const { authConfig: { token }, config } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];
  const client = new Client({ apiUrl, token, currentTeam, debug });
  let contextName = null;

  try {
    ({ contextName } = await getScope(client));
  } catch (err) {
    if (err.code === 'not_authorized' || err.code === 'team_deleted') {
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

  const domains = await getDomains(client, contextName);
  output.log(
    `${plural('domain', domains.length, true)} found under ${chalk.bold(
      contextName
    )} ${chalk.gray(lsStamp())}\n`
  );
  if (domains.length > 0) {
    console.log(`${formatDomainsTable(domains)}\n`);
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
        chalk.gray('cf'),
        chalk.gray('age')
      ].map(s => chalk.dim(s)),
      ...domains.map(domain => {
        const cf = domain.cdnEnabled || false;
        const url = chalk.bold(domain.name);
        const time = chalk.gray(ms(current.getTime() - domain.createdAt));
        return ['', url, domain.serviceType, domain.verified, cf, time];
      })
    ],
    {
      align: ['l', 'l', 'l', 'l', 'l'],
      hsep: ' '.repeat(4),
      stringLength: strlen
    }
  );
}
