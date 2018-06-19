// @flow
import chalk from 'chalk'
import psl from 'psl'

import { CLIContext, Output } from '../../util/types'
import * as Errors from '../../util/errors'
import addDomain from '../../util/domains/add-domain'
import updateDomain from '../../util/domains/update-domain.js'
import cmd from '../../../../util/output/cmd'
import dnsTable from '../../util/dns-table'
import getContextName from '../../util/get-context-name'
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

  if (args.length !== 1) {
    output.error(`${cmd('now domains rm <domain>')} expects one argument`)
    return 1
  }

  if (opts['--cdn'] && opts['--external']) {
    output.error(`It's not possible to enable CDN for an external domain`)
    return 1
  }

  if (typeof opts['--cdn'] !== 'undefined' && typeof opts['--no-cdn'] !== 'undefined') {
    output.error(`You can't use ${cmd('--cdn')} and ${cmd('--no-cdn')} at the same time`)
    return 1
  }

  const domainName = String(args[0])
  if (!await promptBool(`Are you sure you want to add "${domainName}"?`)) {
    return 0
  }

  // If the user is adding with subdomain, warn about what he's doing
  const { domain, subdomain } = psl.parse(domainName)
  if (!domain) {
    output.error(`The given domain '${domainName}' is not valid.`)
    return 1;
  }

  if (subdomain) {
    output.warn(
      `You are adding "${domainName}" as a domain name which seems to contain a subdomain part "${subdomain}".\n` +
      '  This is probably wrong unless you really know what you are doing.\n' +
      `  To add the root domain instead please run: ${chalk.cyan(
        'now domain add ' +
          (opts['--external'] ? '-e ' : '') +
          domain
      )}`
    )
    if (!await promptBool(`Continue adding "${domainName}" as a domain name?`)) {
      return 1;
    }
  }

  const addStamp = stamp()
  const addedDomain = await addDomain(now, domainName, contextName, opts['--external'])

  if (addedDomain instanceof Errors.NeedUpgrade) {
    output.error(`Custom domains are only supported for premium accounts. Please upgrade.`)
    return 1
  } else if (addedDomain instanceof Errors.DomainPermissionDenied) {
    output.error(`You don't have permissions over domain ${chalk.underline(addedDomain.meta.domain)} under ${chalk.bold(addedDomain.meta.context)}.`)
    return 1
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
  }

  if (typeof opts['--cdn'] !== 'undefined' || typeof opts['--no-cdn'] !== 'undefined') {
    const enableCdn = typeof opts['--no-cdn'] === 'undefined'
    await updateDomain(now, domainName, enableCdn)
  }

  if (addedDomain instanceof Errors.DomainAlreadyExists) {
    console.log(
      `${chalk.cyan('> Success!')} Domain ${chalk.bold(
        chalk.underline(addedDomain.meta.domain)
      )} ${chalk.dim(`(${addedDomain.meta.uid})`)} updated successfully ${addStamp()}`
    )
    return 0
  }

  if (!addedDomain.verified) {
    output.warn(
      `The domain was added but it's not verified. If the domain is ${chalk.bold(`external`)}\n` +
      `  please, remove it and add it back using ${cmd(`now domains add ${domainName} --external`)}.`
    )
  }

  console.log(
    `${chalk.cyan('> Success!')} Domain ${chalk.bold(
      chalk.underline(domainName)
    )} ${chalk.dim(`(${addedDomain.uid})`)} added ${addStamp()}`
  )
  return 0;
}
