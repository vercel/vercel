// @flow
import chalk from 'chalk'
import ms from 'ms'

import { CLIContext, Output } from '../../util/types'
import { handleDomainConfigurationError } from '../../util/error-handlers'
import * as Errors from '../../util/errors'
import dnsTable from '../../util/dns-table'
import finishCertOrder from '../../util/certs/finish-cert-order'
import getCnsFromArgs from '../../util/certs/get-cns-from-args'
import getContextName from '../../util/get-context-name'
import Now from '../../util'
import stamp from '../../../../util/output/stamp'
import type { CLICertsOptions } from '../../util/types'

async function finish(ctx: CLIContext, opts: CLICertsOptions, args: string[], output: Output): Promise<number> {
  const {authConfig: { credentials }, config: { sh }} = ctx
  const { currentTeam } = sh;
  const { apiUrl } = ctx;
  const contextName = getContextName(sh);
  const addStamp = stamp()

  const {
    ['--debug']: debugEnabled,
  } = opts;

  // $FlowFixMe
  const {token} = credentials.find(item => item.provider === 'sh')
  const now = new Now({ apiUrl, token, debug: debugEnabled, currentTeam })

  if (args.length < 1) {
    output.error(`Invalid number of arguments to finish a certificate order. Usage:`)
    output.print(`  ${chalk.cyan(`now certs finish <cn>[, <cn>]`)}\n`)
    now.close();
    return 1
  }

  const cns = getCnsFromArgs(args)
  const cert = await finishCertOrder(now, cns, contextName)
  if (cert instanceof Errors.CantSolveChallenge) {
    output.error(`We can't solve the ${cert.meta.type} challenge for domain ${cert.meta.domain}.`)
    if (cert.meta.type === 'dns-01') {
      output.error(`The certificate provider could not resolve the DNS queries for ${cert.meta.domain}.`)
      output.print(`  This might happen to new domains or domains with recent DNS changes. Please retry later.\n`)
    } else {
      output.error(`The certificate provider could not resolve the HTTP queries for ${cert.meta.domain}.`)
      output.print(`  The DNS propagation may take a few minutes, please verify your settings:\n\n`)
      output.print(dnsTable([['', 'ALIAS', 'alias.zeit.co']]) + '\n');
    }
    return 1
  } else if (cert instanceof Errors.TooManyRequests) {
    output.error(`Too many requests detected for ${cert.meta.api} API. Try again in ${ms(cert.meta.retryAfter * 1000, { long: true })}.`)
    return 1
  } else if (cert instanceof Errors.TooManyCertificates) {
    output.error(`Too many certificates already issued for exact set of domains: ${cert.meta.domains.join(', ')}`)
    return 1
  } else if (cert instanceof Errors.DomainValidationRunning) {
    output.error(`There is a validation in course for ${chalk.underline(cert.meta.domain)}. Wait until it finishes.`)
    return 1
  } else if (cert instanceof Errors.DomainConfigurationError) {
    handleDomainConfigurationError(output, cert)
    return 1
  } else if (cert instanceof Errors.CantGenerateWildcardCert) {
    output.error(`Wildcard certificates are allowed only for domains in ${chalk.underline('zeit.world')}`)
    return 1
  } else if (cert instanceof Errors.DomainsShouldShareRoot) {
    output.error(`All given common names should share the same root domain.`)
    return 1
  } else if (cert instanceof Errors.InvalidWildcardDomain) {
    output.error(`Invalid domain ${chalk.underline(cert.meta.domain)}. Wildcard domains can only be followed by a root domain.`)
    return 1
  } else if (cert instanceof Errors.DomainPermissionDenied) {
    output.error(`You don't have permissions over domain ${chalk.underline(cert.meta.domain)} under ${chalk.bold(cert.meta.context)}.`)
    return 1
  }

  // Print success message
  output.success(`Certificate entry for ${chalk.bold(cert.cns.join(', '))} created ${addStamp()}`)
  return 0;
}

export default finish
