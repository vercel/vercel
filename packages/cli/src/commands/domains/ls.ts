import ms from 'ms';
import chalk from 'chalk';
import plural from 'pluralize';

import Client from '../../util/client';
import getDomains from '../../util/domains/get-domains';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import formatTable from '../../util/format-table';
import { formatDateWithoutTime } from '../../util/format-date';
import type { Domain } from '@vercel-internals/types';
import getCommandFlags from '../../util/get-command-flags';
import {
  PaginationOptions,
  getPaginationOpts,
} from '../../util/get-pagination-opts';
import { getCommandName } from '../../util/pkg-name';
import isDomainExternal from '../../util/domains/is-domain-external';
import { getDomainRegistrar } from '../../util/domains/get-domain-registrar';

export default async function ls(
  client: Client,
  opts: Partial<PaginationOptions>,
  args: string[]
) {
  const { output } = client;

  let paginationOptions;

  try {
    paginationOptions = getPaginationOpts(opts);
  } catch (err: unknown) {
    output.prettyError(err);
    return 1;
  }

  const { contextName } = await getScope(client);

  const lsStamp = stamp();

  if (args.length !== 0) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('domains ls')}`
      )}`
    );
    return 1;
  }

  output.spinner(`Fetching Domains under ${chalk.bold(contextName)}`);

  const { domains, pagination } = await getDomains(
    client,
    ...paginationOptions
  );

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
