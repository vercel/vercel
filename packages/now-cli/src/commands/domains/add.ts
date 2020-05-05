import chalk from 'chalk';
import psl from 'psl';

import { NowContext } from '../../types';
import { Output } from '../../util/output';
import * as ERRORS from '../../util/errors-ts';
import addDomain from '../../util/domains/add-domain';
import Client from '../../util/client';
import cmd from '../../util/output/cmd';
import formatDnsTable from '../../util/format-dns-table';
import formatNSTable from '../../util/format-ns-table';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import param from '../../util/output/param';

type Options = {
  '--cdn': boolean;
  '--debug': boolean;
  '--no-cdn': boolean;
};

export default async function add(
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

  if (opts['--cdn'] !== undefined || opts['--no-cdn'] !== undefined) {
    output.error(`Toggling CF from Now CLI is deprecated.`);
    return 1;
  }

  if (args.length !== 1) {
    output.error(`${cmd('now domains add <domain>')} expects one argument`);
    return 1;
  }

  const domainName = String(args[0]);
  const parsedDomain = psl.parse(domainName);
  if (parsedDomain.error) {
    output.error(`The provided domain name ${param(domainName)} is invalid`);
    return 1;
  }

  const { domain, subdomain } = parsedDomain;
  if (!domain) {
    output.error(`The provided domain '${param(domainName)}' is not valid.`);
    return 1;
  }

  if (subdomain) {
    output.error(
      `You are adding '${domainName}' as a domain name containing a subdomain part '${subdomain}'\n` +
        `  This feature is deprecated, please add just the root domain: ${chalk.cyan(
          `now domain add ${domain}`
        )}`
    );
    return 1;
  }

  const addStamp = stamp();
  const addedDomain = await addDomain(client, domainName, contextName);

  if (addedDomain instanceof ERRORS.InvalidDomain) {
    output.error(
      `The provided domain name "${addedDomain.meta.domain}" is invalid`
    );
    return 1;
  }

  if (addedDomain instanceof ERRORS.DomainAlreadyExists) {
    output.error(
      `The domain ${chalk.underline(
        addedDomain.meta.domain
      )} is already registered by a different account.\n` +
        `  If this seems like a mistake, please contact us at support@vercel.com`
    );
    return 1;
  }

  // We can cast the information because we've just added the domain and it should be there
  console.log(
    `${chalk.cyan('> Success!')} Domain ${chalk.bold(
      addedDomain.name
    )} added correctly. ${addStamp()}\n`
  );

  if (!addedDomain.verified) {
    output.warn(
      `The domain was added but it is not verified. To verify it, you should either:`
    );
    output.print(
      `  ${chalk.gray(
        'a)'
      )} Change your domain nameservers to the following intended set: ${chalk.gray(
        '[recommended]'
      )}\n`
    );
    output.print(
      `\n${formatNSTable(
        addedDomain.intendedNameservers,
        addedDomain.nameservers,
        { extraSpace: '     ' }
      )}\n\n`
    );
    output.print(
      `  ${chalk.gray(
        'b)'
      )} Add a DNS TXT record with the name and value shown below.\n`
    );
    output.print(
      `\n${formatDnsTable([['_now', 'TXT', addedDomain.verificationRecord]], {
        extraSpace: '     ',
      })}\n\n`
    );
    output.print(
      `  We will run a verification for you and you will receive an email upon completion.\n`
    );
    output.print(
      `  If you want to force running a verification, you can run ${cmd(
        'now domains verify <domain>'
      )}\n`
    );
    output.print('  Read more: https://err.sh/now/domain-verification\n\n');
  }

  return 0;
}
