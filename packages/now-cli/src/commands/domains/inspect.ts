import chalk from 'chalk';
import { DomainNotFound, DomainPermissionDenied } from '../../util/errors-ts';
import { NowContext } from '../../types';
import { Output } from '../../util/output';
import Client from '../../util/client';
import cmd from '../../util/output/cmd';
import stamp from '../../util/output/stamp';
import dnsTable from '../../util/format-dns-table';
import formatDate from '../../util/format-date';
import formatNSTable from '../../util/format-ns-table';
import getDomainByName from '../../util/domains/get-domain-by-name';
import getScope from '../../util/get-scope';
import getDomainPrice from '../../util/domains/get-domain-price';
import { getPkgName } from '../../util/pkg-name';

type Options = {
  '--debug': boolean;
};

export default async function inspect(
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
  const debug = opts['--debug'];
  const client = new Client({ apiUrl, token, currentTeam, debug });

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
      `${cmd(`${getPkgName()} domains inspect <domain>`)} expects one argument`
    );
    return 1;
  }

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getPkgName()} domains inspect <domain>`
      )}`
    );
    return 1;
  }

  output.debug(`Fetching domain info`);
  const [domain, renewalPrice] = await Promise.all([
    getDomainByName(client, contextName, domainName),
    getDomainPrice(client, domainName, 'renewal')
      .then(res => (res instanceof Error ? null : res.price))
      .catch(() => null),
  ]);
  if (domain instanceof DomainNotFound) {
    output.error(
      `Domain not found by "${domainName}" under ${chalk.bold(contextName)}`
    );
    output.log(`Run ${cmd(`${getPkgName()} domains ls`)} to see your domains.`);
    return 1;
  }

  if (domain instanceof DomainPermissionDenied) {
    output.error(
      `You don't have access to the domain ${domainName} under ${chalk.bold(
        contextName
      )}`
    );
    output.log(`Run ${cmd(`${getPkgName()} domains ls`)} to see your domains.`);
    return 1;
  }

  output.log(
    `Domain ${domainName} found under ${chalk.bold(contextName)} ${chalk.gray(
      inspectStamp()
    )}`
  );
  output.print('\n');
  output.print(chalk.bold('  General\n\n'));
  output.print(`    ${chalk.cyan('Name')}\t\t\t${domain.name}\n`);
  output.print(`    ${chalk.cyan('Service Type')}\t\t${domain.serviceType}\n`);
  output.print(
    `    ${chalk.cyan('Ordered At')}\t\t\t${formatDate(domain.orderedAt)}\n`
  );
  output.print(
    `    ${chalk.cyan('Transfer Started At')}\t\t${formatDate(
      domain.transferStartedAt
    )}\n`
  );
  output.print(
    `    ${chalk.cyan('Created At')}\t\t\t${formatDate(domain.createdAt)}\n`
  );
  output.print(
    `    ${chalk.cyan('Bought At')}\t\t\t${formatDate(domain.boughtAt)}\n`
  );
  output.print(
    `    ${chalk.cyan('Transferred At')}\t\t${formatDate(
      domain.transferredAt
    )}\n`
  );
  output.print(
    `    ${chalk.cyan('Expires At')}\t\t\t${formatDate(domain.expiresAt)}\n`
  );
  output.print(
    `    ${chalk.cyan('NS Verified At')}\t\t${formatDate(
      domain.nsVerifiedAt
    )}\n`
  );
  output.print(
    `    ${chalk.cyan('TXT Verified At')}\t\t${formatDate(
      domain.txtVerifiedAt
    )}\n`
  );
  if (renewalPrice && domain.boughtAt) {
    output.print(
      `    ${chalk.cyan('Renewal Price')}\t\t$${renewalPrice} USD\n`
    );
  }
  output.print(`    ${chalk.cyan('CDN Enabled')}\t\t\t${true}\n`);
  output.print('\n');

  output.print(chalk.bold('  Nameservers\n\n'));
  output.print(
    `${formatNSTable(domain.intendedNameservers, domain.nameservers, {
      extraSpace: '    ',
    })}\n`
  );
  output.print('\n');

  output.print(chalk.bold('  Verification Record\n\n'));
  output.print(
    `${dnsTable([['_now', 'TXT', domain.verificationRecord]], {
      extraSpace: '    ',
    })}\n`
  );
  output.print('\n');

  if (!domain.verified) {
    output.warn(`This domain is not verified. To verify it you should either:`);
    output.print(
      `  ${chalk.gray(
        'a)'
      )} Change your domain nameservers to the intended set detailed above. ${chalk.gray(
        '[recommended]'
      )}\n`
    );
    output.print(
      `  ${chalk.gray(
        'b)'
      )} Add a DNS TXT record with the name and value shown above.\n\n`
    );
    output.print(
      `  We will run a verification for you and you will receive an email upon completion.\n`
    );
    output.print(
      `  If you want to force running a verification, you can run ${cmd(
        `${getPkgName()} domains verify <domain>`
      )}\n`
    );
    output.print('  Read more: https://err.sh/now/domain-verification\n\n');
  }

  return null;
}
