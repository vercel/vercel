import ms from 'ms';
import chalk from 'chalk';
import plural from 'pluralize';

import wait from '../../util/output/wait';
import Client from '../../util/client';
import getDomains from '../../util/domains/get-domains';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import formatTable from '../../util/format-table';
import { formatDateWithoutTime } from '../../util/format-date';
import { Domain } from '../../types';
import getCommandFlags from '../../util/get-command-flags';
import { getCommandName } from '../../util/pkg-name';
import isDomainExternal from '../../util/domains/is-domain-external';
import { getDomainRegistrar } from '../../util/domains/get-domain-registrar';

type Options = {
  '--next': number;
};

export default async function ls(
  client: Client,
  opts: Partial<Options>,
  args: string[]
) {
  const { output } = client;
  const { '--next': nextTimestamp } = opts;
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
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('domains ls')}`
      )}`
    );
    return 1;
  }

  const cancelWait = wait(`Fetching Domains under ${chalk.bold(contextName)}`);

  const { domains, pagination } = await getDomains(
    client,
    nextTimestamp
  ).finally(() => {
    cancelWait();
  });

  output.log(
    `${plural('Domain', domains.length, true)} found under ${chalk.bold(
      contextName
    )} ${chalk.gray(lsStamp())}`
  );

  if (domains.length > 0) {
    output.print(
      formatDomainsTable(domains).replace(/^(.*)/gm, `${' '.repeat(1)}$1`)
    );
    output.print('\n\n');
  }

  if (pagination && pagination.count === 20) {
    const flags = getCommandFlags(opts, ['_', '--next']);
    output.log(
      `To display the next page, run ${getCommandName(
        `domains ls${flags} --next ${pagination.next}`
      )}`
    );
  }

  return 0;
}

function formatDomainsTable(domains: Domain[]) {
  const current = Date.now();

  const rows: string[][] = domains.map(domain => {
    const expiration = formatDateWithoutTime(domain.expiresAt);
    const age = domain.createdAt ? ms(current - domain.createdAt) : '-';

    return [
      domain.name,
      getDomainRegistrar(domain),
      isDomainExternal(domain) ? 'Third Party' : 'Vercel',
      expiration,
      domain.creator.username,
      chalk.gray(age),
    ];
  });

  return formatTable(
    ['Domain', 'Registrar', 'Nameservers', 'Expiration Date', 'Creator', 'Age'],
    ['l', 'l', 'l', 'l', 'l', 'l'],
    [{ rows }]
  );
}
