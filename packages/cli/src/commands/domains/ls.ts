import type { Domain } from '@vercel-internals/types';
import chalk from 'chalk';
import ms from 'ms';
import plural from 'pluralize';
import output from '../../output-manager';
import type Client from '../../util/client';
import { getDomainRegistrar } from '../../util/domains/get-domain-registrar';
import getDomains from '../../util/domains/get-domains';
import isDomainExternal from '../../util/domains/is-domain-external';
import { printError } from '../../util/error';
import { formatDateWithoutTime } from '../../util/format-date';
import formatTable from '../../util/format-table';
import { parseArguments } from '../../util/get-args';
import getCommandFlags from '../../util/get-command-flags';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { getPaginationOpts } from '../../util/get-pagination-opts';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import { validateJsonOutput } from '../../util/output-format';
import { getCommandName } from '../../util/pkg-name';
import { DomainsLsTelemetryClient } from '../../util/telemetry/commands/domains/ls';
import { validateLsArgs } from '../../util/validate-ls-args';
import { listSubcommand } from './command';

export default async function ls(client: Client, argv: string[]) {
  const telemetry = new DomainsLsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;

  const validationResult = validateLsArgs({
    commandName: 'domains ls',
    args: args,
    maxArgs: 0,
    exitCode: 2,
  });
  if (validationResult !== 0) {
    return validationResult;
  }

  telemetry.trackCliOptionLimit(opts['--limit']);
  telemetry.trackCliOptionNext(opts['--next']);
  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;
  let paginationOptions: (number | undefined)[];

  try {
    paginationOptions = getPaginationOpts(opts);
  } catch (err: unknown) {
    output.prettyError(err);
    return 1;
  }

  const { contextName } = await getScope(client);

  const lsStamp = stamp();

  output.spinner(`Fetching Domains under ${chalk.bold(contextName)}`);

  const { domains, pagination } = await getDomains(
    client,
    ...paginationOptions
  );

  if (asJson) {
    output.stopSpinner();
    const jsonOutput = {
      domains: domains.map(domain => ({
        name: domain.name,
        registrar: getDomainRegistrar(domain),
        nameservers: isDomainExternal(domain) ? 'external' : 'vercel',
        expiresAt: domain.expiresAt,
        createdAt: domain.createdAt,
        creator: domain.creator.username,
      })),
      pagination,
    };
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
  } else {
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
      const flags = getCommandFlags(opts, ['_', '--next', '--format']);
      output.log(
        `To display the next page, run ${getCommandName(
          `domains ls${flags} --next ${pagination.next}`
        )}`
      );
    }
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
