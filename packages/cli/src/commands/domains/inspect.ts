import chalk from 'chalk';
import { DomainNotFound, DomainPermissionDenied } from '../../util/errors-ts';
import type Client from '../../util/client';
import stamp from '../../util/output/stamp';
import formatDate from '../../util/format-date';
import formatNSTable from '../../util/format-ns-table';
import getDomainByName from '../../util/domains/get-domain-by-name';
import { getContextName } from '../../util/get-scope';
import formatTable from '../../util/format-table';
import { findProjectsForDomain } from '../../util/projects/find-projects-for-domain';
import getDomainPrice from '../../util/domains/get-domain-price';
import { getCommandName } from '../../util/pkg-name';
import { getDomainConfig } from '../../util/domains/get-domain-config';
import { getDomainRegistrar } from '../../util/domains/get-domain-registrar';
import { DomainsInspectTelemetryClient } from '../../util/telemetry/commands/domains/inspect';
import output from '../../output-manager';
import { inspectSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';

export default async function inspect(client: Client, argv: string[]) {
  const telemetry = new DomainsInspectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(inspectSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error, client);
    return 2;
  }
  const { args, flags } = parsedArgs;
  const [domainName] = args;

  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;

  const inspectStamp = stamp();

  if (!domainName) {
    output.error(
      `${getCommandName(`domains inspect <domain>`)} expects one argument`
    );
    return 2;
  }

  telemetry.trackCliArgumentDomain(domainName);

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('domains inspect <domain>')}`
      )}`
    );
    return 2;
  }

  output.debug(`Fetching domain info`);

  const contextName = await getContextName(client);
  output.spinner(
    `Fetching Domain ${domainName} under ${chalk.bold(contextName)}`
  );

  const information = await fetchInformation({
    client,
    contextName,
    domainName,
  });

  if (typeof information === 'number') {
    return information;
  }

  const { domain, projects, renewalPrice, domainConfig } = information;

  if (asJson) {
    output.stopSpinner();
    client.stdout.write(
      `${JSON.stringify(
        {
          domain: {
            name: domain.name,
            registrar: getDomainRegistrar(domain),
            expiresAt: domain.expiresAt,
            creator: domain.creator.username,
            createdAt: domain.createdAt,
            edgeNetwork: true,
            renewalPrice: domain.boughtAt && renewalPrice ? renewalPrice : null,
          },
          nameservers: {
            intended: domain.intendedNameservers,
            current: domain.nameservers,
          },
          projects: projects.map(({ project, domains }) => ({
            name: project.name,
            domains,
          })),
          configuration: { misconfigured: domainConfig.misconfigured ?? null },
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  output.log(
    `Domain ${domainName} found under ${chalk.bold(contextName)} ${chalk.gray(
      inspectStamp()
    )}`
  );
  output.print('\n');
  output.print(chalk.bold('  General\n\n'));
  output.print(`    ${chalk.cyan('Name')}\t\t\t${domain.name}\n`);
  output.print(
    `    ${chalk.cyan('Registrar')}\t\t\t${getDomainRegistrar(domain)}\n`
  );
  output.print(
    `    ${chalk.cyan('Expiration Date')}\t\t${formatDate(domain.expiresAt)}\n`
  );
  output.print(
    `    ${chalk.cyan('Creator')}\t\t\t${domain.creator.username}\n`
  );
  output.print(
    `    ${chalk.cyan('Created At')}\t\t\t${formatDate(domain.createdAt)}\n`
  );
  output.print(`    ${chalk.cyan('Edge Network')}\t\tyes\n`);
  output.print(
    `    ${chalk.cyan('Renewal Price')}\t\t${
      domain.boughtAt && renewalPrice ? `$${renewalPrice} USD` : chalk.gray('-')
    }\n`
  );

  output.print('\n');

  output.print(chalk.bold('  Nameservers\n\n'));
  output.print(
    `${formatNSTable(domain.intendedNameservers, domain.nameservers, {
      extraSpace: '    ',
    })}\n`
  );
  output.print('\n');

  if (Array.isArray(projects) && projects.length > 0) {
    output.print(chalk.bold('  Projects\n'));

    const table = formatTable(
      ['Project', 'Domains'],
      ['l', 'l'],
      [
        {
          rows: projects.map(({ project, domains }) => {
            const cols = domains.length ? domains.join(', ') : '-';

            return [project.name, cols];
          }),
        },
      ]
    );

    output.print(
      table
        .split('\n')
        .map(line => `   ${line}`)
        .join('\n')
    );

    output.print('\n');
  }

  if (domainConfig.misconfigured) {
    const contextNameConst = contextName;
    const projectNames = Array.from(
      new Set(projects.map(({ project }) => project.name))
    );
    const recordsSource = projectNames.length
      ? "Check the project's Domains settings for the required DNS records"
      : 'Assign it to a project to see the required DNS records';

    output.warn(
      `This domain is not configured properly. ${recordsSource}, or run ${getCommandName(
        'domains verify --help'
      )} for CLI verification options.`,
      null,
      null,
      null
    );

    if (projectNames.length) {
      projectNames.forEach((name, index) => {
        const prefix = index === 0 ? '  Read more:' : ' '.repeat(12);
        output.print(
          `${prefix} https://vercel.com/${contextNameConst}/${name}/settings/domains\n`
        );
      });
    } else {
      output.print(`  Read more: https://vercel.link/domain-configuration\n`);
    }

    output.print('\n');
  }

  return null;
}

async function fetchInformation({
  client,
  contextName,
  domainName,
}: {
  client: Client;
  contextName: string;
  domainName: string;
}) {
  const [domain, renewalPrice] = await Promise.all([
    getDomainByName(client, contextName, domainName, { ignoreWait: true }),
    getDomainPrice(client, domainName)
      .then(res => (res instanceof Error ? null : res.renewalPrice))
      .catch(() => null),
  ]);

  if (domain instanceof DomainNotFound) {
    output.prettyError(domain);
    return 1;
  }

  if (domain instanceof DomainPermissionDenied) {
    output.prettyError(domain);
    output.log(`Run ${getCommandName(`domains ls`)} to see your domains.`);
    return 1;
  }

  const projects = await findProjectsForDomain(client, domainName);

  if (projects instanceof Error) {
    output.prettyError(projects);
    return 1;
  }

  const domainConfig = await getDomainConfig(client, domainName);

  return {
    domain,
    projects,
    renewalPrice,
    domainConfig,
  };
}
