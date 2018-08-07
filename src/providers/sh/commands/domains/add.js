// @flow
import chalk from 'chalk'
import psl from 'psl'

import { CLIContext, Output } from '../../util/types'
import * as Errors from '../../util/errors'
import addDomain from '../../util/domains/add-domain'
import getDomainByName from '../../util/domains/get-domain-by-name'
import isDomainExternal from '../../util/domains/is-domain-external'
import updateDomain from '../../util/domains/update-domain.js'
import cmd from '../../../../util/output/cmd'
import dnsTable from '../../util/dns-table'
import getContextName from '../../util/get-context-name'
import getBooleanOptionValue from '../../util/get-boolean-option-value'
import Now from '../../util'
import promptBool from '../../../../util/input/prompt-bool'
import stamp from '../../../../util/output/stamp'
import type { CLIDomainsOptions } from '../../util/types'
import zeitWorldTable from '../../util/zeit-world-table'

export default async function add(ctx: CLIContext, opts: CLIDomainsOptions, args: string[], output: Output): Promise<number> {
  const {authConfig: { credentials }, config: { sh }} = ctx
  const { currentTeam } = sh;
  const contextName = getContextName(sh);
  const { apiUrl } = ctx;

  // $FlowFixMe
  const {token} = credentials.find(item => item.provider === 'sh')
  const now = new Now({ apiUrl, token, debug: opts['--debug'], currentTeam })
  const cdnEnabled = getBooleanOptionValue(opts, 'cdn');

  if (cdnEnabled instanceof Errors.ConflictingOption) {
    output.error(`You can't use ${cmd('--cdn')} and ${cmd('--no-cdn')} in the same command`)
    return 1
  }

  if (opts['--external'] && opts['--cdn']) {
    output.error(`You can’t enable the Now CDN for domains that are not pointing to zeit.world`);
    return 1;
  }

  if (args.length !== 1) {
    output.error(`${cmd('now domains rm <domain>')} expects one argument`)
    return 1
  }

  // If the user is adding with subdomain, warn about what he's doing
  const domainName = String(args[0])
  const { domain, subdomain } = psl.parse(domainName)
  if (!domain) {
    output.error(`The domain '${domainName}' is not valid.`)
    return 1;
  }

  // Do not allow to add domains with a subdomain
  if (subdomain) {
    output.error(
      `You are adding '${domainName}' as a domain name containing a subdomain part '${subdomain}'\n` +
      `  This feature is deprecated, please add just the root domain: ${chalk.cyan(
        'now domain add ' + (opts['--external'] ? '-e ' : '') + domain
      )}`
    )
    return 1;
  }

  // Check if the domain exists and ask for confirmation if it doesn't
  const domainInfo = await getDomainByName(output, now, contextName, domain);
  if (!domainInfo && opts['--external'] && !await promptBool(`Are you sure you want to add "${domainName}"?`)) {
    return 0
  }

  // Do not allow to switch from internal to external or viceversa if the domain is added
  if (domainInfo && isDomainExternal(domainInfo) !== Boolean(opts['--external'])) {
    const youWant = isDomainExternal(domainInfo) ? 'non-external' : 'external'
    const youHave = isDomainExternal(domainInfo) ? 'external' : 'non-external'
    output.error(
      `You already have the domain ${domainInfo.name} as as ${youHave} domain.\n` +
      `  If you want to change the domain to be ${youWant}, please remove it and then add it back as an ${youWant} domain.`
    )
    return 1;
  }

  const addStamp = stamp()
  if (!domainInfo || !domainInfo.verified) {
    const addedDomain = await addDomain(now, domainName, contextName, opts['--external'], cdnEnabled)
    if (addedDomain instanceof Errors.CDNNeedsUpgrade) {
      output.error(`You can't add domains with CDN enabled from an OSS plan.`)
      return 1
    } else if (addedDomain instanceof Errors.DomainPermissionDenied) {
      if (domainInfo) {
        output.error(`You don't have permissions over domain ${chalk.underline(addedDomain.meta.domain)} under ${chalk.bold(addedDomain.meta.context)}.`)
        return 1
      } else {
        output.error(`The domain ${chalk.underline(addedDomain.meta.domain)} is already registered by a different account.\n` +
          `  If this seems like a mistake, please contact us at support@zeit.co`)
        return 1
      }
    } else if (addedDomain instanceof Errors.DomainVerificationFailed) {
      output.error(`We couldn't verify the domain ${chalk.underline(addedDomain.meta.domain)}.\n`)
      output.print(`  Please make sure that your nameservers point to ${chalk.underline('zeit.world')}.\n`)
      output.print(`  Examples: (full list at ${chalk.underline('https://zeit.world')})\n`)
      output.print(zeitWorldTable() + '\n');
      output.print(`\n  As an alternative, you can add following records to your DNS settings:\n`)
      output.print(dnsTable([
        ['_now', 'TXT', addedDomain.meta.token],
        addedDomain.meta.subdomain === null
          ? ['', 'ALIAS', 'alias.zeit.co']
          : [addedDomain.meta.subdomain, 'CNAME', 'alias.zeit.co']
      ], '  ') + '\n');
      return 1
    } else if (addedDomain instanceof Errors.DomainAlreadyExists) {
      output.error(`The domain exists already`);
      return 1
    } else {
      const addedDomainInfo = await getDomainByName(output, now, contextName, domain);
      if (addedDomainInfo) {
        maybeWarnAboutUnverified(output, domainName, addedDomain.verified)
        if (addedDomainInfo.cdnEnabled) {
          console.log(`${chalk.cyan('> Success!')} Domain ${chalk.bold(chalk.underline(domainName))} was added and configured with CDN enabled. ${addStamp()}`)
          return 0
        }
      }
      console.log(`${chalk.cyan('> Success!')} Domain ${chalk.bold(chalk.underline(domainName))} was added. ${addStamp()}`)
      return 0;
    }
  } else if (cdnEnabled !== undefined && domainInfo.cdnEnabled !== cdnEnabled) {
    maybeWarnAboutUnverified(output, domainName, domainInfo.verified)
    await updateDomain(now, domainName, cdnEnabled)
    if (cdnEnabled) {
      console.log(`${chalk.cyan('> Success!')} Domain ${chalk.bold(chalk.underline(domainName))} was updated and configured with CDN enabled. ${addStamp()}`)
      return 0
    } else {
      console.log(`${chalk.cyan('> Success!')} Domain ${chalk.bold(chalk.underline(domainName))} was updated and configured with CDN disabled. ${addStamp()}`)
      return 0
    }
  } else {
    maybeWarnAboutUnverified(output, domainName, domainInfo.verified)
    console.log(`You requested to modify information for ${chalk.bold(chalk.underline(domainName))} that is already as requested; nothing was changed.`)
    return 0
  }
}

function maybeWarnAboutUnverified(output: Output, domainName: string, isVerified: boolean) {
  if (!isVerified) {
    output.warn(
      `The domain was added but it could not be verified. If the domain doesn't point to ${chalk.bold('zeit.world')} nameservers\n` +
      `  please, remove the domain and add it back using ${cmd(`now domains add ${domainName} --external`)}.`
    )
  }
}
