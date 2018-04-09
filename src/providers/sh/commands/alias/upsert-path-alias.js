// @flow
import chalk from 'chalk'
import wait from '../../../../util/output/wait'

import { Now, Output } from './types'
import * as Errors from './errors'
import createCertificate from './create-certificate'
import type { AliasRecord, PathRule } from './types'
import setupDomain from './setup-domain'

const NOW_SH_REGEX = /\.now\.sh$/

async function upsertPathAlias(output: Output,now: Now, rules: PathRule[], alias: string,contextName: string) {
  if (!NOW_SH_REGEX.test(alias)) {
    output.log(`${chalk.bold(chalk.underline(alias))} is a custom domain.`)
    const result = await setupDomain(output, now, alias, contextName)
    if (
      (result instanceof Errors.DNSPermissionDenied) ||
      (result instanceof Errors.DomainNameserversNotFound) ||
      (result instanceof Errors.DomainNotVerified) ||
      (result instanceof Errors.DomainPermissionDenied) ||
      (result instanceof Errors.DomainVerificationFailed) ||
      (result instanceof Errors.NeedUpgrade) ||
      (result instanceof Errors.PaymentSourceNotFound) ||
      (result instanceof Errors.UserAborted)
    ) {
      return result
    }
  }

  const cancelMessage = wait(`Updating path alias rules for ${alias}`)
  try {
    const record: AliasRecord = await now.fetch(`/now/aliases`, {
      body: { alias, rules },
      method: 'POST',
    })
    cancelMessage()
    return record
  } catch (error) {
    cancelMessage()

    // If the certificate is missing we create it without expecting failures
    // then we call back upsertPathAliasRules
    if (error.code === 'cert_missing' || error.code === 'cert_expired') {
      const cert = await createCertificate(output, now, alias)
      if (
        (cert instanceof Errors.DomainConfigurationError) ||
        (cert instanceof Errors.DomainValidationRunning) ||
        (cert instanceof Errors.TooManyCertificates)
      ) {
        return cert
      } else {
        return upsertPathAlias(output, now, rules, alias, contextName)
      }
    }

    // The alias already exists so we fail in silence returning the id
    if (error.status === 409) {
      const sameRecord: AliasRecord = { uid: error.uid, alias: error.alias }
      return sameRecord
    }

    // There was a validation error for a rule
    if (error.code === 'rule_validation_failed') {
      return new Errors.RuleValidationFailed(error.serverMessage)
    }

    // We do not support nested subdomains
    if (error.code === 'invalid_alias') {
      return new Errors.InvalidAlias(alias)
    }

    if (error.status === 403) {
      if (error.code === 'custom_domain_needs_upgrade') {
        return new Errors.NeedUpgrade()
      }

      if (error.code === 'alias_in_use') {
        console.log(error)
        return new Errors.AliasInUse(alias)
      }

      if (error.code === 'forbidden') {
        return new Errors.DomainPermissionDenied(alias, contextName)
      }
    }

    throw error
  }
}

export default upsertPathAlias
