import chalk from 'chalk';
import { DomainNotFound, DomainPermissionDenied } from '../../util/errors-ts';
import { NowContext } from '../../types';
import { Output } from '../../util/output';
import Client from '../../util/client';
import cmd from '../../util/output/cmd';
import dnsTable from '../../util/format-dns-table';
import formatDate from '../../util/format-date';
import formatNSTable from '../../util/format-ns-table';
import getDomainByName from '../../util/domains/get-domain-by-name';
import getScope from '../../util/get-scope';

type Options = {
  '--debug': boolean;
};

export default async function inspect(
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
  const { contextName } = await getScope(client);
  const [domainName] = args;

  if (!domainName) {
    output.error(`${cmd('now domains inspect <domain>')} expects one argument`);
    return 1;
  }

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        '`now domains inspect <domain>`'
      )}`
    );
    return 1;
  }

  output.debug(`Fetching domain info`);
  const domain = await getDomainByName(client, contextName, domainName);
  if (domain instanceof DomainNotFound) {
    output.error(
      `Domain not found by "${domainName}" under ${chalk.bold(contextName)}`
    );
    output.log(`Run ${cmd('now domains ls')} to see your domains.`);
    return 1;
  }

  if (domain instanceof DomainPermissionDenied) {
    output.error(
      `You don't have access to the domain ${domainName} under ${chalk.bold(
        contextName
      )}`
    );
    output.log(`Run ${cmd('now domains ls')} to see your domains.`);
    return 1;
  }

  output.print('\n');
  output.print(chalk.bold('  Domain Info\n'));
  output.print(`    ${chalk.dim('name')}\t\t${domain.name}\n`);
  output.print(`    ${chalk.dim('serviceType')}\t\t${domain.serviceType}\n`);
  output.print(
    `    ${chalk.dim('createdAt')}\t\t${formatDate(domain.createdAt)}\n`
  );
  output.print(
    `    ${chalk.dim('expiresAt')}\t\t${formatDate(domain.expiresAt)}\n`
  );
  output.print(
    `    ${chalk.dim('boughtAt')}\t\t${formatDate(domain.boughtAt)}\n`
  );
  output.print(
    `    ${chalk.dim('nsVerifiedAt')}\t${formatDate(domain.nsVerifiedAt)}\n`
  );
  output.print(
    `    ${chalk.dim('txtVerifiedAt')}\t${formatDate(domain.txtVerifiedAt)}\n`
  );
  output.print(`    ${chalk.dim('cdnEnabled')}\t\t${domain.cdnEnabled}\n`);
  output.print(`    ${chalk.dim('suffix')}\t\t${domain.suffix}\n`);
  output.print(`    ${chalk.dim('aliases')}\t\t${domain.aliases.length}\n`);
  output.print(`    ${chalk.dim('certs')}\t\t${domain.certs.length}\n`);
  output.print('\n');

  output.print(chalk.bold('  Nameservers\n'));
  output.print(
    `${formatNSTable(domain.intendedNameServers, domain.nameServers, {
      extraSpace: '    '
    })}\n`
  );
  output.print('\n');

  output.print(chalk.bold('  Verification Record\n'));
  output.print(
    `${dnsTable([['_now', 'TXT', domain.verificationRecord]], {
      extraSpace: '    '
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
        'now domains verify <domain>'
      )}\n`
    );
    output.print('  Read more: https://err.sh/now-cli/domain-verification\n');
  }

  return null;
}
