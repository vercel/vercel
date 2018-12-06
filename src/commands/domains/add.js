import chalk from 'chalk';
import psl from 'psl';
import * as Errors from '../../util/errors';
import addDomain from '../../util/domains/add-domain';
import getDomainByName from '../../util/domains/get-domain-by-name';
import getBooleanOptionValue from '../../util/get-boolean-option-value';
import formatNSTable from '../../util/format-ns-table';
import formatDnsTable from '../../util/format-dns-table';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import cmd from '../../util/output/cmd';
import Now from '../../util';

export default async function add(ctx, opts, args, output) {
  const { authConfig: { token }, config } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];

  let contextName = null;

  try {
    ({ contextName } = await getScope({
      apiUrl,
      token,
      debug,
      currentTeam
    }));
  } catch (err) {
    if (err.code === 'not_authorized') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  const now = new Now({ apiUrl, token, debug, currentTeam });
  const cdnEnabled = getBooleanOptionValue(opts, 'cdn');
  if (cdnEnabled instanceof Errors.ConflictingOption) {
    output.error(`You can't use ${cmd('--cdn')} and ${cmd('--no-cdn')} in the same command`);
    return 1;
  }

  if (args.length !== 1) {
    output.error(`${cmd('now domains add <domain>')} expects one argument`);
    return 1;
  }

  const domainName = String(args[0]);
  const { domain, subdomain } = psl.parse(domainName);
  if (!domain) {
    output.error(`The domain '${domainName}' is not valid.`);
    return 1;
  }

  if (subdomain) {
    output.error(
      `You are adding '${domainName}' as a domain name containing a subdomain part '${subdomain}'\n` +
        `  This feature is deprecated, please add just the root domain: ${chalk.cyan(
          `now domain add ${opts['--external'] ? '-e ' : ''}${domain}`
        )}`
    );
    return 1;
  }

  const addStamp = stamp();
  const addedDomain = await addDomain(now, domainName, contextName, cdnEnabled);
  if (addedDomain instanceof Errors.CDNNeedsUpgrade) {
    output.error(`You can't add domains with CDN enabled from an OSS plan.`);
    return 1;
  }

  if (addedDomain instanceof Errors.InvalidDomain) {
    output.error(`The provided domain name "${addedDomain.meta.domain}" is invalid`);
    return 1;
  }

  if (addedDomain instanceof Errors.DomainAlreadyExists) {
    output.error(
      `The domain ${chalk.underline(addedDomain.meta.domain)} is already registered by a different account.\n` +
        `  If this seems like a mistake, please contact us at support@zeit.co`
    );
    return 1;
  }

  const domainInfo = await getDomainByName(output, now, contextName, domain);
  console.log(`${chalk.cyan('> Success!')} Domain ${chalk.bold(domainInfo.name)} added correctly. ${addStamp()}\n`);

  if (!domainInfo.verified) {
    output.warn(`The domain was added but it is not verified. To verify it, you should either:`);
    output.print(`  ${chalk.gray('a)')} Change your domain nameservers to the following intended set: ${chalk.gray('[recommended]')}\n`);
    output.print(`\n${formatNSTable(domainInfo.intendedNameServers, domainInfo.nameServers, { extraSpace: '     ' })}\n\n`);
    output.print(`  ${chalk.gray('b)')} Add a DNS TXT record with the name and value shown below.\n`);
    output.print(`\n${formatDnsTable([['_now', 'TXT', domainInfo.verificationRecord]], {extraSpace: '     '})}\n\n`);
    output.print(`  We will run a verification for you and you will receive an email upon completion.\n`);
    output.print(`  If you want to force running a verification, you can run ${cmd('now domains verify <domain>')}\n`);
    output.print('  Read more: https://err.sh/now-cli/domain-verification\n');
 }

  return 0;
}

