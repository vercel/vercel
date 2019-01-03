import chalk from 'chalk';
import { NowContext } from '../../types';
import { Output } from '../../util/output';
import * as ERRORS from '../../util/errors-ts';
import Client from '../../util/client';
import cmd from '../../util/output/cmd';
import formatDnsTable from '../../util/format-dns-table';
import formatNSTable from '../../util/format-ns-table';
import getDomainByName from '../../util/domains/get-domain-by-name';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import verifyDomain from '../../util/domains/verify-domain';

type Options = {
  '--debug': boolean;
};

export default async function verify(
  ctx: NowContext,
  opts: Options,
  args: string[],
  output: Output
) {
  const {
    authConfig: { token },
    config
  } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];
  const client = new Client({ apiUrl, token, currentTeam, debug });
  const { contextName } = await getScope(client);
  const [domainName] = args;

  if (!domainName) {
    output.error(`${cmd('now domains verify <domain>')} expects one argument`);
    return 1;
  }

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        '`now domains verify <domain>`'
      )}`
    );
    return 1;
  }

  const domain = await getDomainByName(client, contextName, domainName);
  if (domain instanceof ERRORS.DomainNotFound) {
    output.error(
      `Domain not found by "${domainName}" under ${chalk.bold(contextName)}`
    );
    output.log(`Run ${cmd('now domains ls')} to see your domains.`);
    return 1;
  }

  if (domain instanceof ERRORS.DomainPermissionDenied) {
    output.error(
      `You don't have access to the domain ${domainName} under ${chalk.bold(
        contextName
      )}`
    );
    output.log(`Run ${cmd('now domains ls')} to see your domains.`);
    return 1;
  }

  const verifyStamp = stamp();
  const result = await verifyDomain(client, domain.name, contextName);
  if (result instanceof ERRORS.DomainVerificationFailed) {
    const { nsVerification, txtVerification } = result.meta;
    output.error(
      `The domain ${
        domain.name
      } could not be verified due to the following reasons: ${verifyStamp()}\n`
    );
    output.print(
      `  ${chalk.gray(
        'a)'
      )} Nameservers verification failed since we see a different set than the intended set:`
    );
    output.print(
      `\n${formatNSTable(
        nsVerification.intendedNameservers,
        nsVerification.nameservers,
        { extraSpace: '     ' }
      )}\n\n`
    );
    output.print(
      `  ${chalk.gray(
        'b)'
      )} DNS TXT verification failed since found no matching records.`
    );
    output.print(
      `\n${formatDnsTable(
        [['_now', 'TXT', txtVerification.verificationRecord]],
        { extraSpace: '     ' }
      )}\n\n`
    );
    output.print(
      `  Once your domain uses either the nameservers or the TXT DNS record from above, run again ${cmd(
        'now domains verify <domain>'
      )}.\n`
    );
    output.print(
      `  We will also periodically run a verification check for you and you will receive an email once your domain is verified.\n`
    );
    output.print('  Read more: https://err.sh/now-cli/domain-verification\n\n');
    return 1;
  }

  if (result.txtVerifiedAt) {
    console.log(
      `${chalk.cyan('> Success!')} Domain ${chalk.bold(
        domain.name
      )} was verified using DNS TXT record. ${verifyStamp()}`
    );
    output.print(
      `  You can verify with nameservers too. Run ${cmd(
        'now domains inspect <domain>'
      )} to find out the intended set.\n`
    );
    return 0;
  }

  console.log(
    `${chalk.cyan('> Success!')} Domain ${chalk.bold(
      domain.name
    )} was verified using nameservers. ${verifyStamp()}`
  );
  return 0;
}
