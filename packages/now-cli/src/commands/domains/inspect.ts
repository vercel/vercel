import chalk from 'chalk';
import { DomainNotFound, DomainPermissionDenied } from '../../util/errors-ts';
import { NowContext } from '../../types';
import { Output } from '../../util/output';
import Client from '../../util/client';
import stamp from '../../util/output/stamp';
import formatDate from '../../util/format-date';
import formatNSTable from '../../util/format-ns-table';
import getDomainByName from '../../util/domains/get-domain-by-name';
import getScope from '../../util/get-scope';
import formatTable from '../../util/format-table';
import { findProjectsForDomain } from '../../util/projects/find-projects-for-domain';
import getDomainPrice from '../../util/domains/get-domain-price';
import { getCommandName } from '../../util/pkg-name';
import { getDomainConfig } from '../../util/domains/get-domain-config';
import code from '../../util/output/code';
import wait from '../../util/output/wait';
import { getDomainRegistrar } from '../../util/domains/get-domain-registrar';

type Options = {
  '--debug': boolean;
};

export default async function inspect(
  ctx: NowContext,
  opts: Options,
  args: string[]
) {
  const {
    authConfig: { token },
    output,
    config,
  } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];
  const client = new Client({ apiUrl, token, currentTeam, debug, output });

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

  const [domainName] = args;
  const inspectStamp = stamp();

  if (!domainName) {
    output.error(
      `${getCommandName(`domains inspect <domain>`)} expects one argument`
    );
    return 1;
  }

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('domains inspect <domain>')}`
      )}`
    );
    return 1;
  }

  output.debug(`Fetching domain info`);

  const cancelWait = wait(
    `Fetching Domain ${domainName} under ${chalk.bold(contextName)}`
  );

  const information = await fetchInformation({
    output,
    client,
    contextName,
    domainName,
    cancelWait,
  }).finally(() => {
    cancelWait();
  });

  if (typeof information === 'number') {
    return information;
  }

  const { domain, projects, renewalPrice, domainConfig } = information;

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
          rows: projects.map(project => {
            const name = project.name;

            const domains = (project.alias || [])
              .map(target => target.domain)
              .filter(alias => alias.endsWith(domainName));

            const cols = domains.length ? domains.join(', ') : '-';

            return [name, cols];
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
    output.warn(
      `This Domain is not configured properly. To configure it you should either:`,
      null,
      null,
      null,
      {
        boxen: {
          margin: {
            left: 2,
            right: 0,
            bottom: 0,
            top: 0,
          },
        },
      }
    );
    output.print(
      `  ${chalk.grey('a)')} ` +
        `Set the following record on your DNS provider to continue: ` +
        `${code(`A ${domainName} 76.76.21.21`)} ` +
        `${chalk.grey('[recommended]')}\n`
    );
    output.print(
      `  ${chalk.grey('b)')} ` +
        `Change your Domains's nameservers to the intended set detailed above.\n\n`
    );
    output.print(
      `  We will run a verification for you and you will receive an email upon completion.\n`
    );

    const contextNameConst = contextName;
    const projectNames = Array.from(
      new Set(projects.map(project => project.name))
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
  output,
  client,
  contextName,
  domainName,
  cancelWait,
}: {
  output: Output;
  client: Client;
  contextName: string;
  domainName: string;
  cancelWait: () => void;
}) {
  const [domain, renewalPrice] = await Promise.all([
    getDomainByName(client, contextName, domainName, { ignoreWait: true }),
    getDomainPrice(client, domainName, 'renewal')
      .then(res => (res instanceof Error ? null : res.price))
      .catch(() => null),
  ]);

  if (domain instanceof DomainNotFound) {
    cancelWait();
    output.prettyError(domain);
    return 1;
  }

  if (domain instanceof DomainPermissionDenied) {
    cancelWait();
    output.prettyError(domain);
    output.log(`Run ${getCommandName(`domains ls`)} to see your domains.`);
    return 1;
  }

  const projects = await findProjectsForDomain(client, domainName);

  if (projects instanceof Error) {
    cancelWait();
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
